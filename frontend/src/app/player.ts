/** YT iframe player wrapper. Absorbs the entire YT surface: the onYouTubeIframeAPIReady
 *  handshake race (window._ytReadySeen stub in index.html), the 4s retry ladder,
 *  nocookie host + playerVars, and command buffering until ready. Reports raw
 *  facts via PlayerEvent; knows nothing about the server or sync policy. */
import type { VideoId } from "./domain.ts"

declare const YT: {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer
  PlayerState: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }
}
type YTPlayerOptions = {
  host: string
  width: string
  height: string
  playerVars: Record<string, number | string>
  events: {
    onReady: () => void
    onStateChange: (e: { data: number }) => void
    onPlaybackRateChange: (e: { data: number }) => void
    onError?: (e: { data: number }) => void
  }
}
interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void
  seekTo(s: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
  isMuted(): boolean
  setPlaybackRate(rate: number): void
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
    _ytAppReady?: () => void
    _ytReadySeen?: boolean
  }
}

export type PlayerEvent =
  | { kind: "ready" }
  | { kind: "state"; state: "ended" | "playing" | "paused" | "other" }
  | { kind: "rate"; rate: number }
  | { kind: "error"; code: number }

export type Player = {
  /** Idempotent; YT replaces the host div (#player) with its iframe. */
  attach(host: HTMLElement): void
  load(id: VideoId, startAt: number): void
  play(): void
  pause(): void
  mute(): void
  unMute(): void
  isMuted(): boolean
  seek(t: number): void
  setRate(rate: number): void
  currentTime(): number
  isPlaying(): boolean
  isReady(): boolean
  toggleFullscreen(): void
  onEvent(cb: (e: PlayerEvent) => void): () => void
}

const READY_RETRY_MS = 4000

export function createPlayer(): Player {
  let yt: YTPlayer | null = null
  let ready = false
  let host: HTMLElement | null = null
  const pending: Array<(p: YTPlayer) => void> = []
  const subs = new Set<(e: PlayerEvent) => void>()

  const emit = (e: PlayerEvent) => subs.forEach((cb) => cb(e))

  function whenReady(fn: (p: YTPlayer) => void) {
    if (ready && yt) fn(yt)
    else pending.push(fn)
  }

  function create() {
    if (yt || !host) return
    try {
      const player = new YT.Player(host, {
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          playsinline: 1,
          origin: location.origin,
        },
        events: {
          onReady: () => {
            yt = player
            ready = true
            for (const fn of pending.splice(0)) fn(player)
            emit({ kind: "ready" })
          },
          onError: (e) => {
            console.error(
              "[sameframe] YT player error",
              e.data,
              "https://developers.google.com/youtube/iframe_api_reference#onError",
            )
            emit({ kind: "error", code: e.data })
          },
          onStateChange: (e) => {
            const state = e.data === YT.PlayerState.ENDED
              ? "ended"
              : e.data === YT.PlayerState.PLAYING
              ? "playing"
              : e.data === YT.PlayerState.PAUSED
              ? "paused"
              : "other"
            emit({ kind: "state", state })
          },
          onPlaybackRateChange: (e) => emit({ kind: "rate", rate: e.data }),
        },
      })
    } catch (err) {
      console.error("[sameframe] createPlayer failed", err)
    }
  }

  function onApiReady() {
    create()
  }

  function handshake() {
    window._ytAppReady = onApiReady
    if (window._ytReadySeen) {
      onApiReady()
    } else {
      window.onYouTubeIframeAPIReady = onApiReady
    }
    setTimeout(() => {
      if (ready) return
      if (typeof YT === "undefined") {
        console.warn("[sameframe] YT undefined after 4s — retrying iframe_api")
        const s = document.createElement("script")
        s.src = "https://www.youtube.com/iframe_api"
        s.onerror = () =>
          console.error("[sameframe] retry iframe_api load error")
        document.head.appendChild(s)
      } else if (!yt) {
        console.warn(
          "[sameframe] YT defined but player null — retrying createPlayer",
        )
        create()
      }
    }, READY_RETRY_MS)
  }

  return {
    attach(el) {
      if (host) return
      host = el
      handshake()
    },
    load(id, startAt) {
      whenReady((p) => {
        try {
          p.loadVideoById({ videoId: id, startSeconds: startAt })
        } catch (err) {
          console.error("[sameframe] loadVideoById failed", err)
          setTimeout(() => {
            try {
              p.loadVideoById({ videoId: id, startSeconds: startAt })
            } catch (e) {
              console.error(e)
            }
          }, 500)
        }
      })
    },
    play() {
      whenReady((p) => {
        try {
          p.playVideo()
        } catch {}
      })
    },
    pause() {
      whenReady((p) => {
        try {
          p.pauseVideo()
        } catch {}
      })
    },
    mute() {
      whenReady((p) => {
        try {
          p.mute()
        } catch {}
      })
    },
    unMute() {
      whenReady((p) => {
        try {
          p.unMute()
        } catch {}
      })
    },
    isMuted() {
      try {
        return ready && yt ? yt.isMuted() : false
      } catch {
        return false
      }
    },
    seek(t) {
      whenReady((p) => {
        try {
          p.seekTo(t, true)
        } catch {}
      })
    },
    setRate(rate) {
      whenReady((p) => {
        try {
          p.setPlaybackRate(rate)
        } catch {}
      })
    },
    currentTime() {
      try {
        return ready && yt ? yt.getCurrentTime() : 0
      } catch {
        return 0
      }
    },
    isPlaying() {
      try {
        return ready && yt
          ? yt.getPlayerState() === YT.PlayerState.PLAYING
          : false
      } catch {
        return false
      }
    },
    isReady() {
      return ready
    },
    toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
        return
      }
      // YT replaces the #player div with its iframe (keeping the id), so the
      // fullscreen target is the iframe itself, its child, or the wrapper.
      const el = document.getElementById("player")
      const found = el?.querySelector("iframe")
      const frame = found instanceof HTMLIFrameElement ? found : null
      const target = frame ??
        (el instanceof HTMLIFrameElement ? el : (el?.parentElement ?? null))
      target?.requestFullscreen?.().catch(() => {})
    },
    onEvent(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}
