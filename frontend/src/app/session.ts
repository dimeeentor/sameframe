/** THE deep module: sync policy. Owns the reduction of server messages into
 *  state, optimistic commands, suppression windows, drift correction, and the
 *  400ms tick. Plain TS — testable with fake transport/player, no DOM, no Svelte.
 *
 *  Key invariant: the server broadcasts `load`/`queue` back to their sender, so
 *  the reducer must be idempotent under own-echo (a `load` for the video we
 *  already loaded must NOT reload the player — that restarts playback). */
import { composeShareUrl, type ConnectionStatus, type RoomCode, type SyncSnapshot, type VideoId } from "./domain.ts"
import type { ClientMsg, ServerMsg } from "./wire.ts"
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
}

const TICK_MS = 400
const PUBLIC_URL_POLL_MS = 5000
const DRIFT_LIMIT = 1.2
const USER_SEEK_JUMP = 1.5

export function createSession(transport: Transport, player: Player, roomCode: RoomCode): Session {
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
    }
    subs.forEach((cb) => cb(snap))
  }

  function suppress(ms = 1200) {
    s.suppressUntil = Date.now() + ms
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

  // A remote load can arrive with no user activation (second client, fresh
  // join), so the browser blocks unmuted autoplay and the iframe sticks on
  // YT's "click to start" overlay. Muted playback is always allowed: retry
  // muted after a beat and restore sound on the user's first input.
  function retryMutedAutoplay(videoId: VideoId) {
    setTimeout(() => {
      if (s.videoId !== videoId || !s.isPlaying || player.isPlaying()) return
      suppress(800)
      player.mute()
      player.play()
      document.addEventListener("pointerdown", () => player.unMute(), { once: true })
    }, 1000)
  }

  function applyRemoteVideo(videoId: VideoId, currentTime: number, isPlaying: boolean) {
    // own echo of our optimistic load — player is already on this video
    if (videoId === s.videoId) {
      correctDrift(currentTime, isPlaying)
      return
    }
    s.videoId = videoId
    s.isPlaying = isPlaying
    // YT reads 0 until the new video cues; without this the next tick sees a
    // >1.5s jump from the old video and broadcasts a bogus seek(0)
    suppress(1500)
    player.load(videoId, currentTime)
    if (isPlaying) retryMutedAutoplay(videoId)
    if (!isPlaying) {
      if (pauseAfterLoad) clearTimeout(pauseAfterLoad)
      pauseAfterLoad = setTimeout(() => {
        suppress(800)
        player.pause()
        if (currentTime) player.seek(currentTime)
      }, 800)
    }
  }

  function correctDrift(remoteTime: number, remotePlaying: boolean) {
    if (!player.isReady() || !s.videoId) return
    const local = player.currentTime()
    if (Math.abs(local - remoteTime) > DRIFT_LIMIT) {
      suppress(1200)
      player.seek(remoteTime)
    }
    if (remotePlaying !== player.isPlaying()) {
      suppress(800)
      if (remotePlaying) player.play()
      else player.pause()
      s.isPlaying = remotePlaying
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
        suppress(1200)
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
    if (s.videoId) {
      // user seeked inside the YT UI: time jumped and we didn't cause it
      if (!isSuppressed() && Math.abs(t - s.lastTickTime) > USER_SEEK_JUMP) {
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
    if (e.kind === "error") return
    if (e.kind === "rate") {
      if (!isSuppressed()) send({ type: "rate", playbackRate: e.rate })
      return
    }
    if (e.kind !== "state") return
    if (e.state === "ended") {
      if (!isSuppressed()) send({ type: "ended" })
      s.isPlaying = false
      publish()
      return
    }
    if (isSuppressed() || !s.videoId) return
    const t = player.currentTime()
    if (e.state === "playing") {
      s.isPlaying = true
      send({ type: "play", currentTime: t })
    } else if (e.state === "paused") {
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
    suppress(1500)
    player.load(id, 0)
    publish()
    send({ type: "load", videoId: id })
  }

  function addToQueue(id: VideoId) {
    const wasEmpty = s.queue.length === 0 && !s.videoId
    if (!s.queue.includes(id)) s.queue = [...s.queue, id]
    publish()
    send({ type: "queue_add", videoId: id })
    if (wasEmpty) loadVideo(id)
  }

  function removeFromQueue(index: number) {
    if (index < 0 || index >= s.queue.length) return
    s.queue = s.queue.filter((_, i) => i !== index)
    if (s.queueIndex >= s.queue.length) s.queueIndex = s.queue.length - 1
    publish()
    send({ type: "queue_remove", index })
  }

  function reorderQueue(from: number, to: number) {
    if (from === to || from < 0 || from >= s.queue.length) return
    const next = [...s.queue]
    const [id] = next.splice(from, 1)
    if (!id) return
    next.splice(to, 0, id)
    s.queue = next
    s.queueIndex = s.videoId ? next.indexOf(s.videoId) : -1
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
    // first input after a muted-autoplay start restores sound instead of pausing
    if (player.isMuted()) {
      player.unMute()
      return
    }
    const t = player.currentTime()
    suppress(800)
    if (s.isPlaying) {
      player.pause()
      s.isPlaying = false
      send({ type: "pause", currentTime: t })
    } else {
      player.play()
      s.isPlaying = true
      send({ type: "play", currentTime: t })
    }
    publish()
  }

  function seekBy(delta: number) {
    if (!player.isReady() || !s.videoId) return
    const target = Math.max(0, player.currentTime() + delta)
    suppress(800)
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
    seekBy,
    toggleFullscreen,
  }
}
