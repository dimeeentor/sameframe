/** Wire protocol shared by the API and the frontend — one definition so the
 *  two sides cannot drift. Owns the VideoId brand, both message unions, and
 *  the boundary parsers that turn unknown JSON into validated messages.
 *  Importers trust the types; `Record<string, unknown>` stops here. */

declare const __videoId: unique symbol
export type VideoId = string & { readonly [__videoId]: true }

export const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/

declare const __roomCode: unique symbol
export type RoomCode = string & { readonly [__roomCode]: true }

export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/

export type RoomMetadata = {
  code: RoomCode
  createdAt: number
}

export type ServerMsg =
  | { type: "clients"; count: number }
  | { type: "public_url"; url: string }
  | {
      type: "load"
      videoId: VideoId
      currentTime: number
      isPlaying: boolean
      queue: VideoId[]
      queueIndex: number
    }
  | { type: "queue"; queue: VideoId[]; queueIndex: number }
  | {
      type: "sync"
      videoId: VideoId | null
      currentTime: number
      isPlaying: boolean
      playbackRate: number
      queue: VideoId[]
      queueIndex: number
      publicUrl: string | null
    }
  | { type: "play"; currentTime: number }
  | { type: "pause"; currentTime: number }
  | { type: "seek"; currentTime: number }
  | { type: "rate"; playbackRate: number }

export type ClientMsg =
  | { type: "load"; videoId: VideoId }
  | { type: "queue_add"; videoId: VideoId }
  | { type: "queue_remove"; index: number }
  | { type: "queue_reorder"; from: number; to: number }
  | { type: "queue_clear" }
  | { type: "play"; currentTime: number }
  | { type: "pause"; currentTime: number }
  | { type: "seek"; currentTime: number }
  | { type: "rate"; playbackRate: number }
  | { type: "ended" }
  | { type: "sync_request" }

function asId(v: unknown): VideoId | null {
  return typeof v === "string" && VIDEO_ID_RE.test(v) ? (v as VideoId) : null
}

function asQueue(v: unknown): VideoId[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is VideoId => typeof x === "string" && VIDEO_ID_RE.test(x))
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

function isIndex(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0
}

/** Boundary validation, server → client: null on anything unexpected
 *  (dropped upstream). */
export function parseServerMsg(raw: unknown): ServerMsg | null {
  if (typeof raw !== "object" || raw === null) return null
  const m = raw as Record<string, unknown>
  switch (m.type) {
    case "clients":
      return typeof m.count === "number"
        ? { type: "clients", count: m.count }
        : null
    case "public_url":
      return typeof m.url === "string" ? { type: "public_url", url: m.url } : null
    case "load": {
      const videoId = asId(m.videoId)
      if (!videoId) return null
      return {
        type: "load",
        videoId,
        currentTime: num(m.currentTime, 0),
        isPlaying: m.isPlaying !== false,
        queue: asQueue(m.queue),
        queueIndex: num(m.queueIndex, -1),
      }
    }
    case "queue":
      return {
        type: "queue",
        queue: asQueue(m.queue),
        queueIndex: num(m.queueIndex, -1),
      }
    case "sync": {
      const videoId = m.videoId === null ? null : asId(m.videoId)
      if (m.videoId != null && !videoId) return null
      return {
        type: "sync",
        videoId,
        currentTime: num(m.currentTime, 0),
        isPlaying: m.isPlaying === true,
        playbackRate: num(m.playbackRate, 1),
        queue: asQueue(m.queue),
        queueIndex: num(m.queueIndex, -1),
        publicUrl: typeof m.publicUrl === "string" ? m.publicUrl : null,
      }
    }
    case "play":
      return { type: "play", currentTime: num(m.currentTime, 0) }
    case "pause":
      return { type: "pause", currentTime: num(m.currentTime, 0) }
    case "seek":
      return { type: "seek", currentTime: num(m.currentTime, 0) }
    case "rate":
      return { type: "rate", playbackRate: num(m.playbackRate, 1) }
    default:
      return null
  }
}

/** Boundary validation, client → server: null on anything unexpected. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== "object" || raw === null) return null
  const m = raw as Record<string, unknown>
  switch (m.type) {
    case "load":
    case "queue_add": {
      const videoId = asId(m.videoId)
      return videoId ? { type: m.type, videoId } : null
    }
    case "queue_remove":
      return isIndex(m.index) ? { type: "queue_remove", index: m.index } : null
    case "queue_reorder":
      return isIndex(m.from) && isIndex(m.to)
        ? { type: "queue_reorder", from: m.from, to: m.to }
        : null
    case "queue_clear":
      return { type: "queue_clear" }
    case "play":
      return { type: "play", currentTime: num(m.currentTime, 0) }
    case "pause":
      return { type: "pause", currentTime: num(m.currentTime, 0) }
    case "seek":
      return { type: "seek", currentTime: num(m.currentTime, 0) }
    case "rate":
      return typeof m.playbackRate === "number" &&
          Number.isFinite(m.playbackRate) &&
          m.playbackRate > 0
        ? { type: "rate", playbackRate: m.playbackRate }
        : null
    case "ended":
      return { type: "ended" }
    case "sync_request":
      return { type: "sync_request" }
    default:
      return null
  }
}
