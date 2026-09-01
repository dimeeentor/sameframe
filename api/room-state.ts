/// <reference lib="deno.unstable" />
/** Pure RoomState transformations — no I/O, no KV, no broadcast. */

import type { RoomCode, VideoId } from "../shared/messages.ts"
import type { RoomState } from "./rooms.ts"

export function estimatedTime(s: RoomState): number {
  if (!s.isPlaying || s.videoId === null) return s.currentTime
  const elapsed = ((Date.now() - s.updatedAt) / 1000) * s.playbackRate
  return s.currentTime + elapsed
}

export function getSyncPayload(s: RoomState, publicUrl: string | null) {
  return {
    type: "sync" as const,
    videoId: s.videoId,
    currentTime: estimatedTime(s),
    isPlaying: s.isPlaying,
    playbackRate: s.playbackRate,
    updatedAt: Date.now(),
    queue: s.queue,
    queueIndex: s.queueIndex,
    publicUrl,
    code: s.code,
  }
}

export function applyLoad(s: RoomState, videoId: VideoId): RoomState {
  let idx = s.queue.indexOf(videoId)
  const queue = idx === -1 ? [...s.queue, videoId] : s.queue
  if (idx === -1) idx = queue.length - 1
  return {
    ...s,
    queue,
    queueIndex: idx,
    videoId,
    currentTime: 0,
    isPlaying: true,
    updatedAt: Date.now(),
  }
}

export function applyQueueAdd(s: RoomState, videoId: VideoId): RoomState {
  if (s.queue.includes(videoId)) return s
  return { ...s, queue: [...s.queue, videoId] }
}

export function applyQueueRemove(s: RoomState, index: number): RoomState {
  if (index < 0 || index >= s.queue.length) return s
  const queue = s.queue.filter((_, i) => i !== index)
  let queueIndex = s.queueIndex
  if (queueIndex >= queue.length) queueIndex = queue.length - 1
  // if we removed the currently playing item and something remains, caller should load next
  return { ...s, queue, queueIndex }
}

export function applyQueueReorder(s: RoomState, from: number, to: number): RoomState {
  if (from === to || from < 0 || from >= s.queue.length || to < 0 || to >= s.queue.length) return s
  const queue = [...s.queue]
  const [id] = queue.splice(from, 1)
  if (!id) return s
  queue.splice(to, 0, id)
  const queueIndex = s.videoId ? queue.indexOf(s.videoId) : -1
  return { ...s, queue, queueIndex }
}

export function applyQueueClear(s: RoomState): RoomState {
  return { ...s, queue: [], queueIndex: -1 }
}

export function applyPlay(s: RoomState, currentTime: number): RoomState {
  return { ...s, currentTime, isPlaying: true, updatedAt: Date.now() }
}

export function applyPause(s: RoomState, currentTime: number): RoomState {
  return { ...s, currentTime, isPlaying: false, updatedAt: Date.now() }
}

export function applySeek(s: RoomState, currentTime: number): RoomState {
  return { ...s, currentTime, updatedAt: Date.now() }
}

export function applyRate(s: RoomState, playbackRate: number): RoomState {
  // rebase: elapsed so far accrued at the old rate; the new one applies from now
  return { ...s, playbackRate, currentTime: estimatedTime(s), updatedAt: Date.now() }
}

export function advanceTo(s: RoomState, index: number): RoomState | null {
  if (index < 0 || index >= s.queue.length) return null
  const id = s.queue[index]
  return {
    ...s,
    queueIndex: index,
    videoId: id,
    currentTime: 0,
    isPlaying: true,
    updatedAt: Date.now(),
  }
}

export function handleEnded(s: RoomState): RoomState | null {
  const last = s.queue.length - 1
  if (s.queueIndex < last) return advanceTo(s, s.queueIndex + 1)
  if (s.queue.length > 1 && s.queueIndex === last) return advanceTo(s, 0)
  return null
}
