/** Queue mechanics shared by both sides of the wire: the server applies them
 *  inside its room transition, the client replays them optimistically. One
 *  definition so optimistic client state cannot drift from server state.
 *
 *  Ops are pure and no-op by identity: each returns the input object unchanged
 *  when the request is invalid or redundant. */
import type { VideoId } from "./messages.ts"

export type QueueState = {
  videoId: VideoId | null
  queue: VideoId[]
  queueIndex: number
}

/** Append to the queue unless already present. */
export function enqueue<S extends QueueState>(s: S, id: VideoId): S {
  if (s.queue.includes(id)) return s
  return { ...s, queue: [...s.queue, id] }
}

/** Load: append unless present, then make it the current video. Playback
 *  fields (currentTime, isPlaying) stay with each side's own policy. */
export function queueLoad<S extends QueueState>(s: S, id: VideoId): S {
  const withId = enqueue(s, id)
  return { ...withId, videoId: id, queueIndex: withId.queue.indexOf(id) }
}

/** Remove by index; queueIndex clamped into range. */
export function removeAt<S extends QueueState>(s: S, index: number): S {
  if (index < 0 || index >= s.queue.length) return s
  return {
    ...s,
    queue: s.queue.filter((_, i) => i !== index),
    queueIndex: Math.min(s.queueIndex, s.queue.length - 2),
  }
}

/** Move one entry from `from` to `to`; queueIndex follows the current video. */
export function moveTo<S extends QueueState>(
  s: S,
  from: number,
  to: number,
): S {
  if (
    from === to || from < 0 || from >= s.queue.length || to < 0 ||
    to >= s.queue.length
  ) return s
  const queue = [...s.queue]
  const [id] = queue.splice(from, 1)
  if (!id) return s
  queue.splice(to, 0, id)
  return { ...s, queue, queueIndex: s.videoId ? queue.indexOf(s.videoId) : -1 }
}
