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
  subscribe(cb: (s: SyncSnapshot) => void): () => void

  loadVideo(id: VideoId): void
  addToQueue(id: VideoId): void
  removeFromQueue(index: number): void
  reorderQueue(from: number, to: number): void
  clearQueue(): void
  togglePlay(): void
  unmute(): void
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
  muted: boolean
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
    muted: false,
  }
  const subs = new Set<(snap: SyncSnapshot) => void>()
  const timers: ReturnType<typeof setInterval>[] = []
  let pauseAfterLoad: ReturnType<typeof setTimeout> | null = null
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
      muted: s.muted,
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

  // Plays made on the room's behalf carry no local user gesture, and browsers
  // reject unmuted playback started that way: playVideo() is ignored and the
  // iframe sits on YT's click-to-play splash while the room watches on. So the
  // player is built muted (playerVars.mute), which is always allowed to start,
  // and stays that way until the user asks for sound. `autoMuted` is whether
  // *we* own the mute; once the user takes it over we stop touching it.
  let autoMuted = true

  function setMuted(m: boolean) {
    if (s.muted === m) return
    s.muted = m
    publish()
  }

  function unmute() {
    autoMuted = false
    player.unMute()
    setMuted(false)
  }

  function applyRemoteVideo(
    videoId: VideoId,
    currentTime: number,
    isPlaying: boolean,
  ) {
    // own echo of our optimistic load, the player is already on this video
    if (videoId === s.videoId) {
      correctDrift(currentTime, isPlaying)
      return
    }
    s.videoId = videoId
    s.isPlaying = isPlaying
    // a pause queued for the previous load must not land on this one
    if (pauseAfterLoad) {
      clearTimeout(pauseAfterLoad)
      pauseAfterLoad = null
    }
    // YT reads 0 until the new video cues; without this the next tick sees a
    // >1.5s jump from the old video and broadcasts a bogus seek(0)
    suppress(LOAD_SUPPRESS_MS)
    player.load(videoId, currentTime)
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
    if (!player.isReady() || !s.videoId) return
    const local = player.currentTime()
    if (Math.abs(local - remoteTime) > DRIFT_LIMIT) {
      suppress(INDUCED_MS)
      player.seek(remoteTime)
    }
    // mid-transition the iframe still reports the old state (BUFFERING reads as
    // not-playing), so inside a window we caused, trust our own intent
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
    // reconciling inside a window we caused would fight our own intent: the
    // iframe reads "not playing" through BUFFERING, and clearing isPlaying
    // there makes the eventual PLAYING look like fresh local intent to broadcast
    if (s.videoId && !isSuppressed()) {
      // user seeked inside the YT UI: time jumped and we didn't cause it
      if (Math.abs(t - s.lastTickTime) > USER_SEEK_JUMP) {
        send({ type: "seek", currentTime: t })
      }
      if (player.isPlaying() !== s.isPlaying) {
        s.isPlaying = player.isPlaying()
        publish()
      }
    }
    setMuted(autoMuted && s.isPlaying && player.isMuted())
    s.lastTickTime = t
  }

  function onPlayerEvent(e: PlayerEvent) {
    if (e.kind === "ready") {
      send({ type: "sync_request" })
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
    // only a transition that changes what we believe carries new intent; one
    // that confirms it is the tail of a play/pause already commanded, and
    // rebroadcasting that round-trips our stale position back to the room
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
    } catch {}
  }

  // --- commands: optimistic state + suppression + transport.send ---

  function loadVideo(id: VideoId) {
    s.videoId = id
    s.isPlaying = true
    if (pauseAfterLoad) {
      clearTimeout(pauseAfterLoad)
      pauseAfterLoad = null
    }
    // a hand-picked video rides the user's own gesture, so it gets sound
    if (autoMuted) unmute()
    player.load(id, 0)
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
    // first press while playing muted means "let me hear it", not "stop": the
    // video is already in sync, only the sound is missing
    if (autoMuted && player.isMuted() && s.isPlaying) {
      unmute()
      return
    }
    if (autoMuted) unmute()
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
    if (autoMuted) unmute()
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
      player.attach(host)
    },
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
    unmute,
    seekBy,
    toggleFullscreen,
  }
}
