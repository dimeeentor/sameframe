/// <reference lib="deno.unstable" />
/** Room domain: the RoomState shape and the pure transition from a client
 *  command to the next state plus outgoing messages. No I/O, no KV, no
 *  sockets. A transition whose `next` is null (or the same object) changed
 *  nothing; callers must not send its effects (same contract as mutateRoom). */
import type {
  ClientMsg,
  RoomCode,
  ServerMsg,
  VideoId,
} from "../shared/messages.ts"
import { enqueue, moveTo, queueLoad, removeAt } from "../shared/queue.ts"

export type RoomState = {
  code: RoomCode
  createdAt: number
  videoId: VideoId | null
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  updatedAt: number
  queue: VideoId[]
  queueIndex: number
}

export function emptyRoomState(code: RoomCode): RoomState {
  const now = Date.now()
  return {
    code,
    createdAt: now,
    videoId: null,
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
    updatedAt: now,
    queue: [],
    queueIndex: -1,
  }
}

/** Wall-clock position a joining client should start at. */
function estimatedTime(s: RoomState): number {
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

/** Everything a client can command that mutates room state. */
export type ClientCommand = Exclude<ClientMsg, { type: "sync_request" }>

/** Outgoing message from a transition: broadcast to the room (optionally not
 *  to the acting client, which already applied it locally), or reply to the
 *  acting client only. */
export type Effect =
  | { kind: "broadcast"; msg: ServerMsg; excludeSelf?: boolean }
  | { kind: "reply"; msg: ServerMsg }

export type Transition = { next: RoomState | null; effects: Effect[] }

const NOOP: Transition = { next: null, effects: [] }

function queueMsg(s: RoomState): ServerMsg {
  return { type: "queue", queue: s.queue, queueIndex: s.queueIndex }
}

function loadMsg(s: RoomState, videoId: VideoId): ServerMsg {
  return {
    type: "load",
    videoId,
    currentTime: 0,
    isPlaying: true,
    queue: s.queue,
    queueIndex: s.queueIndex,
  }
}

/** Removing the current video with entries left: the survivor at that slot
 *  becomes the current video and starts from the top. */
function loadSurvivor(s: RoomState, index: number): Transition {
  const removed = removeAt(s, index)
  const queueIndex = Math.min(s.queueIndex, removed.queue.length - 1)
  const videoId = removed.queue[queueIndex] as VideoId
  const next: RoomState = {
    ...removed,
    videoId,
    queueIndex,
    currentTime: 0,
    isPlaying: true,
    updatedAt: Date.now(),
  }
  return {
    next,
    effects: [{ kind: "broadcast", msg: loadMsg(next, videoId) }],
  }
}

function advanceTo(s: RoomState, index: number): RoomState | null {
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

/** Auto-advance on video end; wraps around. null = nothing to play next. */
function handleEnded(s: RoomState): RoomState | null {
  const last = s.queue.length - 1
  if (s.queueIndex < last) return advanceTo(s, s.queueIndex + 1)
  if (s.queue.length > 1 && s.queueIndex === last) return advanceTo(s, 0)
  return null
}

export function applyClientMsg(s: RoomState, msg: ClientCommand): Transition {
  switch (msg.type) {
    case "load": {
      const next = {
        ...queueLoad(s, msg.videoId),
        currentTime: 0,
        isPlaying: true,
        updatedAt: Date.now(),
      }
      return {
        next,
        effects: [{ kind: "broadcast", msg: loadMsg(next, msg.videoId) }],
      }
    }
    case "queue_add": {
      const wasEmpty = s.queue.length === 0 && !s.videoId
      const added = enqueue(s, msg.videoId)
      if (added === s) return NOOP
      // first video in an empty room: enqueueing it also starts it
      if (!wasEmpty) {
        return {
          next: added,
          effects: [{ kind: "broadcast", msg: queueMsg(added) }],
        }
      }
      const next = {
        ...queueLoad(added, msg.videoId),
        currentTime: 0,
        isPlaying: true,
        updatedAt: Date.now(),
      }
      return {
        next,
        effects: [
          { kind: "broadcast", msg: queueMsg(next) },
          { kind: "broadcast", msg: loadMsg(next, msg.videoId) },
        ],
      }
    }
    case "queue_remove": {
      if (msg.index < 0 || msg.index >= s.queue.length) return NOOP
      if (s.queueIndex === msg.index && s.queue.length > 1) {
        return loadSurvivor(s, msg.index)
      }
      const removed = removeAt(s, msg.index)
      const next = removed.queue.length === 0
        ? { ...removed, videoId: null, queueIndex: -1 }
        : removed
      return { next, effects: [{ kind: "broadcast", msg: queueMsg(next) }] }
    }
    case "queue_reorder": {
      const next = moveTo(s, msg.from, msg.to)
      if (next === s) return NOOP
      return { next, effects: [{ kind: "broadcast", msg: queueMsg(next) }] }
    }
    case "queue_clear": {
      const next = { ...s, queue: [], queueIndex: -1 }
      return {
        next,
        effects: [{
          kind: "broadcast",
          msg: { type: "queue", queue: [], queueIndex: -1 },
        }],
      }
    }
    case "play": {
      const next = {
        ...s,
        currentTime: msg.currentTime,
        isPlaying: true,
        updatedAt: Date.now(),
      }
      return {
        next,
        effects: [{
          kind: "broadcast",
          msg: { type: "play", currentTime: next.currentTime },
          excludeSelf: true,
        }],
      }
    }
    case "pause": {
      const next = {
        ...s,
        currentTime: msg.currentTime,
        isPlaying: false,
        updatedAt: Date.now(),
      }
      return {
        next,
        effects: [{
          kind: "broadcast",
          msg: { type: "pause", currentTime: next.currentTime },
          excludeSelf: true,
        }],
      }
    }
    case "seek": {
      const next = {
        ...s,
        currentTime: msg.currentTime,
        updatedAt: Date.now(),
      }
      return {
        next,
        effects: [{
          kind: "broadcast",
          msg: { type: "seek", currentTime: next.currentTime },
          excludeSelf: true,
        }],
      }
    }
    case "rate": {
      // rebase: elapsed so far accrued at the old rate; the new one applies from now
      const next = {
        ...s,
        playbackRate: msg.playbackRate,
        currentTime: estimatedTime(s),
        updatedAt: Date.now(),
      }
      return {
        next,
        effects: [{
          kind: "broadcast",
          msg: { type: "rate", playbackRate: next.playbackRate },
          excludeSelf: true,
        }],
      }
    }
    case "ended": {
      // nothing after the last video → null → no-op, so playback never restarts
      const next = handleEnded(s)
      if (!next || next === s) return NOOP
      return {
        next,
        effects: [{
          kind: "broadcast",
          msg: loadMsg(next, next.videoId as VideoId),
        }],
      }
    }
    default: {
      const _exhaustive: never = msg
      void _exhaustive
      return NOOP
    }
  }
}
