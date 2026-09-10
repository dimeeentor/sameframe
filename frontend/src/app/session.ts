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
  type VideoId,
} from "./domain.ts"
import type { ClientMsg, ServerMsg } from "./wire.ts"
import { enqueue, moveTo, removeAt } from "../../../shared/queue.ts"
import type { Player, PlayerEvent } from "./player.ts"
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
}

type SessionState = {
  videoId: VideoId | null
  queue: VideoId[]
  queueIndex: number
  isPlaying: boolean
  playbackRate: number
  publicUrl: string | null
  viewerCount: number
  connection: ConnectionStatus
  suppressUntil: number
  lastTickTime: number
  roomCode: RoomCode | null
  joined: boolean
}

const TICK_MS = 400
const PUBLIC_URL_POLL_MS = 5000
const DRIFT_LIMIT = 1.2
const USER_SEEK_JUMP = 1.5
// how long a transition we caused stays marked as ours. A play runs
// PAUSED → BUFFERING → PLAYING, well over a second on a cold iframe, so its
// window has to outlast buffering; a seek or pause lands much sooner.
const INDUCED_PLAY_MS = 2500
const INDUCED_MS = 1200
const LOAD_SUPPRESS_MS = 1500

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
    publicUrl: null,
    viewerCount: 0,
    connection: "connecting",
    suppressUntil: 0,
    lastTickTime: 0,
    roomCode,
    joined: false,
  }
  const subs = new Set<(snap: SyncSnapshot) => void>()
  const timers: ReturnType<typeof setInterval>[] = []
  let pauseAfterLoad: ReturnType<typeof setTimeout> | null = null
  let playerHost: HTMLElement | null = null
  let started = false

  function publish() {
    const snap: SyncSnapshot = {
      videoId: s.videoId,
      queue: [...s.queue],
      queueIndex: s.queueIndex,
      isPlaying: s.isPlaying,
      playbackRate: s.playbackRate,
      publicUrl: s.publicUrl,
      shareUrl: composeShareUrl(s.publicUrl, s.roomCode),
      viewerCount: s.viewerCount,
      connection: s.connection,
      roomCode: s.roomCode,
      joined: s.joined,
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
    transport.send(msg)
  }

  function mergeQueue(queue: VideoId[], queueIndex: number) {
    s.queue = queue
    s.queueIndex = queueIndex
  }

  let lastRemote: { time: number; at: number; playing: boolean } | null = null

  function noteRemote(time: number, playing: boolean) {
    lastRemote = { time, at: Date.now(), playing }
  }

  function remoteTimeNow(): number {
    if (!lastRemote) return 0
    const elapsed = lastRemote.playing ? (Date.now() - lastRemote.at) / 1000 : 0
    return Math.max(0, lastRemote.time + elapsed)
  }

  function assertSound() {
    player.unMute()
    player.setVolume(100)
  }

  function applyRemoteVideo(
    videoId: VideoId,
    currentTime: number,
    isPlaying: boolean,
  ) {
    if (!s.joined) {
      s.videoId = videoId
      s.isPlaying = isPlaying
      noteRemote(currentTime, isPlaying)
      return
    }
    if (videoId === s.videoId) {
      correctDrift(currentTime, isPlaying)
      return
    }
    s.videoId = videoId
    s.isPlaying = isPlaying
    if (pauseAfterLoad) {
      clearTimeout(pauseAfterLoad)
      pauseAfterLoad = null
    }
    suppress(LOAD_SUPPRESS_MS)
    player.mute()
    player.load(videoId, currentTime)
    assertSound()
    if (isPlaying) {
      suppress(INDUCED_PLAY_MS)
      player.play()
    } else {
      pauseAfterLoad = setTimeout(() => {
        suppress(INDUCED_MS)
        player.pause()
        if (currentTime) player.seek(currentTime)
      }, 800)
    }
  }

  function correctDrift(remoteTime: number, remotePlaying: boolean) {
    if (!s.joined) {
      s.isPlaying = remotePlaying
      noteRemote(remoteTime, remotePlaying)
      return
    }
    if (!player.isReady() || !s.videoId) return
    const local = player.currentTime()
    if (Math.abs(local - remoteTime) > DRIFT_LIMIT) {
      suppress(INDUCED_MS)
      player.seek(remoteTime)
    }
    const effective = isSuppressed() ? s.isPlaying : player.isPlaying()
    if (remotePlaying === effective) return
    s.isPlaying = remotePlaying
    if (remotePlaying) {
      suppress(INDUCED_PLAY_MS)
      player.play()
    } else {
      suppress(INDUCED_MS)
      player.pause()
    }
  }

  function reduce(m: ServerMsg) {
    switch (m.type) {
      case "load":
        if (m.queue.length) mergeQueue(m.queue, m.queueIndex)
        applyRemoteVideo(m.videoId, m.currentTime, m.isPlaying)
        break
      case "sync":
        if (m.publicUrl) s.publicUrl = m.publicUrl
        mergeQueue(m.queue, m.queueIndex)
        if (m.playbackRate !== s.playbackRate) {
          s.playbackRate = m.playbackRate
          suppress(800)
          player.setRate(m.playbackRate)
        }
        if (m.videoId) applyRemoteVideo(m.videoId, m.currentTime, m.isPlaying)
        else {
          s.videoId = null
          s.isPlaying = false
        }
        break
      case "queue":
        mergeQueue(m.queue, m.queueIndex)
        break
      case "play":
        correctDrift(m.currentTime, true)
        break
      case "pause":
        correctDrift(m.currentTime, false)
        break
      case "seek":
        if (!s.joined) {
          noteRemote(m.currentTime, s.isPlaying)
          break
        }
        suppress(INDUCED_MS)
        player.seek(m.currentTime)
        break
      case "rate":
        s.playbackRate = m.playbackRate
        suppress(800)
        player.setRate(m.playbackRate)
        break
      case "clients":
        s.viewerCount = m.count
        break
      case "public_url":
        s.publicUrl = m.url
        break
      default: {
        const _exhaustive: never = m
        void _exhaustive
      }
    }
    publish()
  }

  function tick() {
    if (!player.isReady()) return
    const t = player.currentTime()
    if (s.videoId && !isSuppressed()) {
      if (Math.abs(t - s.lastTickTime) > USER_SEEK_JUMP) {
        send({ type: "seek", currentTime: t })
      }
      if (player.isPlaying() !== s.isPlaying) {
        s.isPlaying = player.isPlaying()
        publish()
      }
    }
    s.lastTickTime = t
  }

  function onPlayerEvent(e: PlayerEvent) {
    if (e.kind === "ready") {
      send({ type: "sync_request" })
      return
    }
    if (e.kind === "autoplayBlocked") {
      console.warn("[sameframe] autoplay blocked — falling back to muted")
      if (s.isPlaying) {
        suppress(INDUCED_PLAY_MS)
        player.mute()
        player.play()
      }
      return
    }
    if (e.kind === "error") return
    if (e.kind === "rate") {
      if (!isSuppressed()) send({ type: "rate", playbackRate: e.rate })
      return
    }
    if (e.kind !== "state") return
    if (e.state === "ended") {
      if (!isSuppressed() && s.videoId) {
        send({ type: "ended", videoId: s.videoId })
      }
      s.isPlaying = false
      publish()
      return
    }
    if (isSuppressed() || !s.videoId) return
    const t = player.currentTime()
    if (e.state === "playing") {
      if (s.isPlaying) return
      s.isPlaying = true
      send({ type: "play", currentTime: t })
    } else if (e.state === "paused") {
      if (!s.isPlaying) return
      s.isPlaying = false
      send({ type: "pause", currentTime: t })
    } else {
      return
    }
    publish()
  }

  async function fetchPublicUrl() {
    try {
      const res = await fetch("/api/public-url")
      if (!res.ok) return
      const j = (await res.json()) as { url: string }
      const url = j.url
      if (url && url !== s.publicUrl) {
        s.publicUrl = url
        publish()
      }
    } catch {
      // best-effort; UI just keeps whatever publicUrl it already had
    }
  }

  // --- commands: optimistic state + suppression + transport.send ---

  function join() {
    if (s.joined || !playerHost) return
    s.joined = true
    const at = remoteTimeNow()
    player.attach(
      playerHost,
      s.videoId ? { id: s.videoId, at, sound: true } : null,
    )
    assertSound()
    if (s.videoId && !s.isPlaying) {
      pauseAfterLoad = setTimeout(() => {
        suppress(INDUCED_MS)
        player.pause()
        if (at) player.seek(at)
      }, 800)
    }
    publish()
  }

  function loadVideo(id: VideoId) {
    const gated = !s.joined
    s.videoId = id
    s.isPlaying = true
    noteRemote(0, true)
    if (pauseAfterLoad) {
      clearTimeout(pauseAfterLoad)
      pauseAfterLoad = null
    }
    // a hand-picked video rides the user's own gesture, so it gets sound
    if (gated) join()
    else {
      assertSound()
      player.load(id, 0)
    }
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
      suppress(INDUCED_PLAY_MS)
      player.play()
      s.isPlaying = true
      send({ type: "play", currentTime: t })
    }
    publish()
  }

  function seekBy(delta: number) {
    if (!player.isReady() || !s.videoId) return
    const target = Math.max(0, player.currentTime() + delta)
    suppress(INDUCED_MS)
    player.seek(target)
    send({ type: "seek", currentTime: target })
  }

  function toggleFullscreen() {
    if (!s.videoId) return
    player.toggleFullscreen()
  }

  return {
    start() {
      if (started) return
      started = true
      transport.onMessage(reduce)
      transport.onStatus((st) => {
        s.connection = st
        publish()
      })
      player.onEvent(onPlayerEvent)
      transport.start()
      timers.push(setInterval(tick, TICK_MS))
      fetchPublicUrl()
      timers.push(setInterval(fetchPublicUrl, PUBLIC_URL_POLL_MS))
    },
    stop() {
      started = false
      timers.forEach(clearInterval)
      timers.length = 0
      // outlives the intervals, and a stopped session must not drive the player
      if (pauseAfterLoad) {
        clearTimeout(pauseAfterLoad)
        pauseAfterLoad = null
      }
      transport.stop()
    },
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
  }
}
