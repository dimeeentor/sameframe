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
  var onYouTubeIframeAPIReady: (() => void) | undefined
  var _ytAppReady: (() => void) | undefined
  var _ytReadySeen: boolean | undefined
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

  /** YT calls can throw if the iframe is mid-teardown; nothing to recover. */
  function safely(fn: (p: YTPlayer) => void) {
    return (p: YTPlayer) => {
      try {
        fn(p)
      } catch {
        // ignored, see doc comment above
      }
    }
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
          autoplay: 1,
          mute: 1,
          disablekb: 1,
          cc_load_policy: 0,
          iv_load_policy: 3,
          hl: navigator.language.split("-")[0],
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

  function frameEl(): HTMLIFrameElement | null {
    const el = document.getElementById("player")
    if (el instanceof HTMLIFrameElement) return el
    const found = el?.querySelector("iframe")
    return found instanceof HTMLIFrameElement ? found : null
  }

  function reclaimFocus() {
    const frame = frameEl()
    if (frame && document.activeElement === frame) frame.blur()
  }

  function handshake() {
    globalThis.addEventListener("blur", () => setTimeout(reclaimFocus, 0))
    globalThis._ytAppReady = onApiReady
    if (globalThis._ytReadySeen) {
      onApiReady()
    } else {
      globalThis.onYouTubeIframeAPIReady = onApiReady
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
      whenReady(safely((p) => p.playVideo()))
    },
    pause() {
      whenReady(safely((p) => p.pauseVideo()))
    },
    mute() {
      whenReady(safely((p) => p.mute()))
    },
    unMute() {
      whenReady(safely((p) => p.unMute()))
    },
    isMuted() {
      try {
        return ready && yt ? yt.isMuted() : false
      } catch {
        return false
      }
    },
    seek(t) {
      whenReady(safely((p) => p.seekTo(t, true)))
    },
    setRate(rate) {
      whenReady(safely((p) => p.setPlaybackRate(rate)))
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
      const frame = frameEl()
      const target = frame?.parentElement ?? frame
      target?.requestFullscreen?.().catch(() => {})
    },
    onEvent(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}
