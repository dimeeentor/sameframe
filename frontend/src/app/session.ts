/** Sync policy. Owns the reduction of server messages into
 *  state, optimistic commands, suppression windows, drift correction, and the
 *  400ms tick. Plain TS, testable with fake transport/player, no DOM, no Svelte.
 *
 *  Key invariant: the server broadcasts `load`/`queue` back to their sender, so
 *  the reducer must be idempotent under own-echo (a `load` for the video we
 *  already loaded must NOT reload the player, since that restarts playback). */
import {
  composeShareUrl,
  type ConnectionStatus,
  type RoomCode,
  type SyncSnapshot,
  type Viewer,
  type VideoId,
} from "./domain.ts"
import type { ClientMsg, ServerMsg } from "./wire.ts"
import { enqueue, moveTo, removeAt } from "../../../shared/queue.ts"
import type { PlaybackState, Player, PlayerEvent } from "./player.ts"
import type { Transport } from "./transport.ts"

export type Session = {
  start(): void
  stop(): void
  attachPlayer(host: HTMLElement): void
  join(): void
  subscribe(cb: (s: SyncSnapshot) => void): () => void

  loadVideo(id: VideoId): void
  addToQueue(id: VideoId): void
  removeFromQueue(index: number): void
  reorderQueue(from: number, to: number): void
  clearQueue(): void
  togglePlay(): void
  seekBy(delta: number): void
  toggleFullscreen(): void
  kick(clientId: string): void
}

type SessionState = {
  videoId: VideoId | null
  queue: VideoId[]
  queueIndex: number
  isPlaying: boolean
  playbackRate: number
  viewerCount: number
  connection: ConnectionStatus
  suppressUntil: number
  lastTickTime: number
  lastTickAt: number
  lastResyncAt: number
  roomCode: RoomCode | null
  joined: boolean
  rev: number
  viewers: Viewer[]
  isOwner: boolean
  kicked: boolean
}

const TICK_MS = 400
const DRIFT_LIMIT = 1.2
const USER_SEEK_JUMP = 1.5
// how long a transition we caused stays marked as ours. A play runs
// PAUSED → BUFFERING → PLAYING, well over a second on a cold iframe, so its
// window has to outlast buffering; a seek or pause lands much sooner.
const INDUCED_PLAY_MS = 2500
const INDUCED_MS = 1200
const LOAD_SUPPRESS_MS = 1500
const RESYNC_DRIFT = 2
const RESYNC_COOLDOWN_MS = 5000
// after a remote play/pause, a player that hasn't followed yet (slow buffering,
// blocked autoplay) is retried locally instead of echoed back as a user action
const FOLLOW_GRACE_MS = 4000
// safety-net resync; each sync_request wakes the hibernating DO, so not more often
const SYNC_EVERY_MS = 20000
const SYNC_QUIET_MS = 3000

export function createSession(
  transport: Transport,
  player: Player,
  roomCode: RoomCode,
): Session {
  const s: SessionState = {
    videoId: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    playbackRate: 1,
    viewerCount: 0,
    connection: "connecting",
    suppressUntil: 0,
    lastTickTime: 0,
    lastTickAt: 0,
    lastResyncAt: 0,
    roomCode,
    joined: false,
    rev: 0,
    viewers: [],
    isOwner: false,
    kicked: false,
  }
  const subs = new Set<(snap: SyncSnapshot) => void>()
  const timers: ReturnType<typeof setInterval>[] = []
  // a load that should end up paused is muted-autoplaying; this holds the time
  // to pause and seek to once it actually starts playing
  let pausePending: number | null = null
  let playerHost: HTMLElement | null = null
  let started = false
  let lastSyncAt = 0
  let lastCommandAt = 0
  let floorRev = 0
  let oneWay = 0
  let rttStart = 0
  let priming = false
  let autoplayRetried = false
  let autoplayStuck = false
  let lastTickState: PlaybackState = "other"

  function publish() {
    const snap: SyncSnapshot = {
      videoId: s.videoId,
      queue: [...s.queue],
      queueIndex: s.queueIndex,
      isPlaying: s.isPlaying && !autoplayStuck,
      playbackRate: s.playbackRate,
      shareUrl: composeShareUrl(s.roomCode),
      viewerCount: s.viewerCount,
      connection: s.connection,
      roomCode: s.roomCode,
      joined: s.joined,
      viewers: [...s.viewers],
      isOwner: s.isOwner,
      kicked: s.kicked,
    }
    subs.forEach((cb) => cb(snap))
  }

  // extends only: a short window must not truncate a longer one still in flight
  function suppress(ms = 1200) {
    s.suppressUntil = Math.max(s.suppressUntil, Date.now() + ms)
  }
  function isSuppressed(): boolean {
    return Date.now() < s.suppressUntil
  }

  function send(msg: ClientMsg) {
    // playback commands carry the last rev seen so the server can reject stale ones
    const playback =
      msg.type === "play" ||
      msg.type === "pause" ||
      msg.type === "seek" ||
      msg.type === "rate"
    if (playback || msg.type === "load") lastCommandAt = Date.now()
    if (playback) floorRev = s.rev + 1
    if (playback || msg.type === "sync_request") rttStart = Date.now()
    transport.send(playback ? { ...msg, rev: s.rev } : msg)
  }

  function noteRtt() {
    if (!rttStart) return
    const half = Math.min(2000, (Date.now() - rttStart) / 2) / 1000
    oneWay = oneWay ? oneWay * 0.7 + half * 0.3 : half
    rttStart = 0
  }

  function lead(time: number, playing: boolean): number {
    return playing ? time + oneWay * s.playbackRate : time
  }

  function mergeQueue(queue: VideoId[], queueIndex: number) {
    s.queue = queue
    s.queueIndex = queueIndex
  }

  let lastRemote: { time: number; at: number; playing: boolean } | null = null
  let anchorOnPlay = false
  let remoteChangeAt = 0

  function followingRemote(): boolean {
    return Date.now() - remoteChangeAt < FOLLOW_GRACE_MS
  }

  function enforce() {
    if (s.isPlaying) {
      suppress(INDUCED_PLAY_MS)
      player.play()
    } else {
      suppress(INDUCED_MS)
      player.pause()
    }
  }

  function noteRemote(time: number, playing: boolean) {
    lastRemote = { time, at: Date.now(), playing }
  }

  function remoteTimeNow(): number {
    if (!lastRemote) return 0
    const elapsed = lastRemote.playing
      ? ((Date.now() - lastRemote.at) / 1000) * s.playbackRate
      : 0
    return Math.max(0, lastRemote.time + elapsed)
  }

  function setRoomRate(rate: number) {
    if (lastRemote) noteRemote(remoteTimeNow(), lastRemote.playing)
    s.playbackRate = rate
  }

  function assertSound() {
    player.unMute()
    player.setVolume(100)
  }

  // loading autoplays muted, which skips YouTube's splash screen; a video that
  // shouldn't be playing is paused again right after
  function loadIntoPlayer(id: VideoId, at: number, playing: boolean) {
    suppress(LOAD_SUPPRESS_MS)
    player.mute()
    player.load(id, at)
    if (playing) {
      assertSound()
      suppress(INDUCED_PLAY_MS)
      player.play()
    } else {
      // stays muted until it is paused, so the brief autoplay is silent
      pausePending = at
    }
  }

  // a play command arrived while the muted autoplay was still pending
  function cancelPendingPause() {
    if (pausePending === null) return
    pausePending = null
    assertSound()
  }

  function applyRemoteVideo(
    videoId: VideoId,
    currentTime: number,
    isPlaying: boolean,
  ) {
    noteRemote(currentTime, isPlaying)
    if (!s.joined) {
      s.videoId = videoId
      s.isPlaying = isPlaying
      return
    }
    if (videoId === s.videoId) {
      correctDrift(currentTime, isPlaying)
      return
    }
    s.videoId = videoId
    s.isPlaying = isPlaying
    anchorOnPlay = currentTime === 0
    remoteChangeAt = Date.now()
    pausePending = null
    loadIntoPlayer(videoId, currentTime, isPlaying)
  }

  function correctDrift(remoteTime: number, remotePlaying: boolean) {
    noteRemote(remoteTime, remotePlaying)
    if (!s.joined) {
      s.isPlaying = remotePlaying
      return
    }
    if (priming) {
      s.isPlaying = remotePlaying
      return
    }
    if (!player.isReady() || !s.videoId) return
    const local = player.currentTime()
    const st = player.state()
    if (st !== "other" && Math.abs(local - remoteTime) > DRIFT_LIMIT) {
      suppress(INDUCED_MS)
      player.seek(remoteTime)
    }
    const effective =
      isSuppressed() || pausePending !== null
        ? s.isPlaying
        : st === "playing" || st === "buffering"
    if (remotePlaying === effective) return
    s.isPlaying = remotePlaying
    remoteChangeAt = Date.now()
    if (remotePlaying) {
      cancelPendingPause()
      suppress(INDUCED_PLAY_MS)
      player.play()
    } else {
      suppress(INDUCED_MS)
      player.pause()
    }
  }

  function reduce(m: ServerMsg) {
    if (m.type === "ack" || m.type === "sync") noteRtt()
    const stale = "rev" in m && m.rev < floorRev && m.type !== "load"
    if ("rev" in m && !stale) s.rev = m.rev
    if (stale && m.type !== "sync") return
    switch (m.type) {
      case "load":
        if (m.queue.length) mergeQueue(m.queue, m.queueIndex)
        applyRemoteVideo(m.videoId, m.currentTime, m.isPlaying)
        break
      case "sync":
        mergeQueue(m.queue, m.queueIndex)
        if (stale) break
        if (m.playbackRate !== s.playbackRate) {
          setRoomRate(m.playbackRate)
          suppress(800)
          player.setRate(m.playbackRate)
        }
        if (m.videoId)
          applyRemoteVideo(
            m.videoId,
            lead(m.currentTime, m.isPlaying),
            m.isPlaying,
          )
        else {
          s.videoId = null
          s.isPlaying = false
        }
        break
      case "queue":
        mergeQueue(m.queue, m.queueIndex)
        break
      case "play":
        correctDrift(lead(m.currentTime, true), true)
        break
      case "pause":
        correctDrift(m.currentTime, false)
        break
      case "seek": {
        const playing = lastRemote?.playing ?? s.isPlaying
        const target = lead(m.currentTime, playing)
        noteRemote(target, playing)
        if (!s.joined) break
        suppress(INDUCED_MS)
        player.seek(target)
        break
      }
      case "rate":
        setRoomRate(m.playbackRate)
        suppress(800)
        player.setRate(m.playbackRate)
        break
      case "clients":
        s.viewerCount = m.count
        s.viewers = m.clients
        s.isOwner = m.clients.some((c) => c.isYou && c.isOwner)
        break
      case "kicked":
        onKicked()
        return
      case "ack":
        break
      default: {
        const _exhaustive: never = m
        void _exhaustive
      }
    }
    publish()
  }

  function resync(t: number, st: PlaybackState, now: number) {
    if (st !== "playing" || !lastRemote?.playing) return
    if (now - s.lastResyncAt < RESYNC_COOLDOWN_MS) return
    const target = remoteTimeNow()
    if (Math.abs(t - target) <= RESYNC_DRIFT) return
    s.lastResyncAt = now
    suppress(INDUCED_MS)
    player.seek(target)
  }

  function tick() {
    if (!player.isReady()) return
    const now = Date.now()
    const t = player.currentTime()
    const st = player.state()
    if (s.videoId && s.joined && !priming && !isSuppressed()) {
      const expected =
        st === "playing" && s.lastTickAt
          ? s.lastTickTime + ((now - s.lastTickAt) / 1000) * s.playbackRate
          : s.lastTickTime
      const settled =
        (st === "playing" || st === "paused" || st === "buffering") &&
        lastTickState !== "other"
      const onTarget =
        lastRemote !== null && Math.abs(t - remoteTimeNow()) < DRIFT_LIMIT
      if (settled && !onTarget && Math.abs(t - expected) > USER_SEEK_JUMP) {
        send({ type: "seek", currentTime: t })
        noteRemote(t, s.isPlaying)
      } else {
        resync(t, st, now)
      }
      if (st === "playing" || st === "paused") {
        const playing = st === "playing"
        if (playing !== s.isPlaying) {
          if (followingRemote()) enforce()
          else {
            s.isPlaying = playing
            noteRemote(t, playing)
            send({ type: playing ? "play" : "pause", currentTime: t })
            publish()
          }
        }
      }
    }
    s.lastTickTime = t
    s.lastTickAt = now
    lastTickState = st
    if (
      s.joined &&
      s.videoId &&
      s.connection === "open" &&
      !isSuppressed() &&
      now - lastSyncAt >= SYNC_EVERY_MS &&
      now - lastCommandAt >= SYNC_QUIET_MS
    ) {
      send({ type: "sync_request" })
      lastSyncAt = now
    }
  }

  function onPlayerEvent(e: PlayerEvent) {
    if (e.kind === "ready") {
      send({ type: "sync_request" })
      lastSyncAt = Date.now()
      return
    }
    if (e.kind === "autoplayBlocked") {
      if (!s.isPlaying && !priming) return
      if (!autoplayRetried) {
        console.warn("[sameframe] autoplay blocked — falling back to muted")
        autoplayRetried = true
        suppress(INDUCED_PLAY_MS)
        player.mute()
        player.play()
        return
      }
      autoplayStuck = true
      publish()
      return
    }
    if (e.kind === "error") return
    if (e.kind === "rate") {
      if (!isSuppressed()) {
        setRoomRate(e.rate)
        send({ type: "rate", playbackRate: e.rate })
      }
      return
    }
    if (e.kind !== "state") return
    if (e.state === "playing") {
      autoplayRetried = false
      if (autoplayStuck) {
        autoplayStuck = false
        assertSound()
        publish()
      }
    }
    if (pausePending !== null && e.state === "playing") {
      const at = pausePending
      pausePending = null
      suppress(INDUCED_MS)
      player.pause()
      if (at) player.seek(at)
      assertSound()
      return
    }
    if (priming) {
      if (e.state !== "playing") return
      priming = false
      suppress(INDUCED_MS)
      if (!s.isPlaying) {
        player.pause()
        player.seek(remoteTimeNow())
      }
      assertSound()
      return
    }
    if (e.state === "playing" && anchorOnPlay) {
      anchorOnPlay = false
      if (lastRemote?.playing) noteRemote(player.currentTime(), true)
    }
    if (e.state === "ended") {
      if (!isSuppressed() && s.videoId) {
        send({ type: "ended", videoId: s.videoId })
      }
      s.isPlaying = false
      noteRemote(player.currentTime(), false)
      publish()
      return
    }
    if (isSuppressed() || !s.videoId) return
    const t = player.currentTime()
    if (e.state === "playing") {
      if (s.isPlaying) return
      if (followingRemote()) return enforce()
      s.isPlaying = true
      noteRemote(t, true)
      send({ type: "play", currentTime: t })
    } else if (e.state === "paused") {
      if (!s.isPlaying) return
      if (followingRemote()) return enforce()
      s.isPlaying = false
      noteRemote(t, false)
      send({ type: "pause", currentTime: t })
    } else {
      return
    }
    publish()
  }

  function onKicked() {
    if (s.kicked) return
    s.kicked = true
    player.destroy()
    stop()
    s.joined = false
    publish()
  }

  function kick(clientId: string) {
    send({ type: "kick", clientId })
  }

  // --- commands: optimistic state + suppression + transport.send ---

  function join() {
    if (s.joined || !playerHost) return
    s.joined = true
    const at = remoteTimeNow()
    priming = !!s.videoId && !s.isPlaying
    player.attach(
      playerHost,
      s.videoId
        ? priming
          ? { id: s.videoId, at, sound: false, playing: true }
          : { id: s.videoId, at, sound: true, playing: s.isPlaying }
        : null,
    )
    if (!priming) assertSound()
    publish()
  }

  function loadVideo(id: VideoId) {
    const gated = !s.joined
    s.videoId = id
    s.isPlaying = false
    noteRemote(0, false)
    anchorOnPlay = true
    pausePending = null
    // a hand-picked video loads paused; join() primes a gated one the same way
    if (gated) join()
    else loadIntoPlayer(id, 0, false)
    publish()
    send({ type: "load", videoId: id })
  }

  function addToQueue(id: VideoId) {
    const wasEmpty = s.queue.length === 0 && !s.videoId
    const added = enqueue(s, id)
    if (added !== s) s.queue = added.queue
    publish()
    send({ type: "queue_add", videoId: id })
    if (wasEmpty) loadVideo(id)
  }

  function removeFromQueue(index: number) {
    const removed = removeAt(s, index)
    if (removed === s) return
    s.queue = removed.queue
    s.queueIndex = removed.queueIndex
    publish()
    send({ type: "queue_remove", index })
  }

  function reorderQueue(from: number, to: number) {
    const moved = moveTo(s, from, to)
    if (moved === s) return
    s.queue = moved.queue
    s.queueIndex = moved.queueIndex
    publish()
    send({ type: "queue_reorder", from, to })
  }

  function clearQueue() {
    s.queue = []
    s.queueIndex = -1
    publish()
    send({ type: "queue_clear" })
  }

  function togglePlay() {
    if (!player.isReady() || !s.videoId) return
    const t = player.currentTime()
    if (s.isPlaying) {
      suppress(INDUCED_MS)
      player.pause()
      s.isPlaying = false
      send({ type: "pause", currentTime: t })
    } else {
      cancelPendingPause()
      suppress(INDUCED_PLAY_MS)
      player.play()
      s.isPlaying = true
      send({ type: "play", currentTime: t })
    }
    noteRemote(t, s.isPlaying)
    publish()
  }

  function seekBy(delta: number) {
    if (!player.isReady() || !s.videoId) return
    const target = Math.max(0, player.currentTime() + delta)
    suppress(INDUCED_MS)
    player.seek(target)
    noteRemote(target, s.isPlaying)
    send({ type: "seek", currentTime: target })
  }

  function toggleFullscreen() {
    if (!s.videoId) return
    player.toggleFullscreen()
  }

  function stop() {
    started = false
    timers.forEach(clearInterval)
    timers.length = 0
    pausePending = null
    transport.stop()
  }

  return {
    start() {
      if (started) return
      started = true
      transport.onMessage(reduce)
      transport.onKicked(() => onKicked())
      transport.onStatus((st) => {
        s.connection = st
        publish()
      })
      player.onEvent(onPlayerEvent)
      transport.start()
      timers.push(setInterval(tick, TICK_MS))
    },
    stop,
    attachPlayer(host) {
      playerHost = host
    },
    join,
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    loadVideo,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    togglePlay,
    seekBy,
    toggleFullscreen,
    kick,
  }
}
