/** Domain types — no transport, no YT, no JSON. Validation enters here. */

import { ROOM_CODE_RE, VIDEO_ID_RE, type RoomCode, type VideoId } from "../../../shared/messages.ts"

export type { VideoId, RoomCode }

/** Pure parser: raw 11-char id, youtu.be, ?v=, /embed|shorts|v/ paths, fallback regex. */
export function parseVideoId(input: string): VideoId | null {
  const url = input.trim()
  if (!url) return null
  if (VIDEO_ID_RE.test(url)) return url as VideoId
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0].slice(0, 11)
      if (VIDEO_ID_RE.test(id)) return id as VideoId
    }
    const v = u.searchParams.get("v")
    if (v && VIDEO_ID_RE.test(v)) return v as VideoId
    const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[2] as VideoId
  } catch {}
  const m = url.match(/[a-zA-Z0-9_-]{11}/)
  return m ? (m[0] as VideoId) : null
}

export const thumb = (id: VideoId): string =>
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
  readonly roomCode: RoomCode | null
}

/** Share-link policy: room code is the only URL param. No ?v= anymore — video lives in KV. */
export function composeShareUrl(
  publicUrl: string | null,
  roomCode: RoomCode | null,
): string {
  const base = publicUrl ? publicUrl.replace(/\/$/, "") : location.origin
  if (!roomCode) return base
  return `${base}/?room=${roomCode}`
}

export function parseRoomCode(input: string): RoomCode | null {
  const v = input.trim().toUpperCase()
  return ROOM_CODE_RE.test(v) ? (v as RoomCode) : null
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
