/** Domain types — no transport, no YT, no JSON. Validation enters here. */

declare const __videoId: unique symbol
export type VideoId = string & { readonly [__videoId]: true }

/** Pure parser: raw 11-char id, youtu.be, ?v=, /embed|shorts|v/ paths, fallback regex. */
export function parseVideoId(input: string): VideoId | null {
  const url = input.trim()
  if (!url) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url as VideoId
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0].slice(0, 11)
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id as VideoId
    }
    const v = u.searchParams.get("v")
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v as VideoId
    const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[2] as VideoId
  } catch {}
  const m = url.match(/[a-zA-Z0-9_-]{11}/)
  return m ? (m[0] as VideoId) : null
}

export const thumb = (id: string): string =>
  `https://img.youtube.com/vi/${id}/hqdefault.jpg`

export type ConnectionStatus = "connecting" | "open" | "polling" | "offline"

/** What components read. Replaced wholesale by the session on every change. */
export type SyncSnapshot = {
  readonly videoId: VideoId | null
  readonly queue: readonly VideoId[]
  readonly queueIndex: number
  readonly isPlaying: boolean
  readonly playbackRate: number
  readonly publicUrl: string | null
  readonly shareUrl: string
  readonly viewerCount: number
  readonly connection: ConnectionStatus
}

/** Share-link policy: tunnel URL wins, then non-local origin, then current URL. */
export function composeShareUrl(
  publicUrl: string | null,
  videoId: VideoId | null,
): string {
  const v = videoId ? `?v=${videoId}` : location.search
  if (publicUrl) return publicUrl.replace(/\/$/, "") + v
  const host = location.hostname
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.")
  if (!isLocal) return location.origin + v
  return location.href
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
