/** Wire types — exact mirror of api/ws.ts + api/state.ts payloads.
 *  Imported only by session.ts and transport.ts. Never re-exported to the UI. */
import type { VideoId } from "./domain.ts"

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
  return typeof v === "string" && v.length === 11 ? (v as VideoId) : null
}

function asQueue(v: unknown): VideoId[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is VideoId => typeof x === "string" && x.length === 11)
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

/** Boundary validation: null on anything unexpected (dropped upstream). */
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
