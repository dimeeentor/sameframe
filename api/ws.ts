import { Hono } from "hono"
import { upgradeWebSocket } from "hono/deno"
import { parseClientMsg } from "../shared/messages.ts"
import {
  broadcast,
  clients,
  getSyncPayload,
  publicUrl,
  setVideo,
  state,
} from "./state.ts"

function loadMsg(videoId: string, queueIndex: number) {
  return {
    type: "load",
    videoId,
    currentTime: 0,
    isPlaying: true,
    queue: state.queue,
    queueIndex,
  }
}

function queueMsg() {
  return {
    type: "queue" as const,
    queue: state.queue,
    queueIndex: state.queueIndex,
  }
}

/** Shared mutation behind every "jump to queue entry" path (ended). */
function advanceTo(index: number) {
  if (index < 0 || index >= state.queue.length) return
  const id = state.queue[index]
  state.queueIndex = index
  state.videoId = id
  state.currentTime = 0
  state.isPlaying = true
  state.updatedAt = Date.now()
  broadcast(loadMsg(id, index))
}

export const ws = new Hono()

ws.get("/ws", (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected websocket", 426)
  }
  return upgradeWebSocket(c, {
    onOpen: (_event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      clients.add(socket)
      console.log(`client connected (${clients.size})`)
      socket.send(JSON.stringify(getSyncPayload()))
      if (publicUrl) {
        socket.send(JSON.stringify({ type: "public_url", url: publicUrl }))
      }
      broadcast({ type: "clients", count: clients.size })
    },

    onClose: (_event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      clients.delete(socket)
      console.log(`client disconnected (${clients.size})`)
      broadcast({ type: "clients", count: clients.size })
    },

    onMessage: (event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      if (typeof event.data !== "string") return
      let raw: unknown
      try {
        raw = JSON.parse(event.data)
      } catch {
        return
      }
      const msg = parseClientMsg(raw)
      if (!msg) return
      try {
        switch (msg.type) {
          case "load": {
            setVideo(msg.videoId, true)
            break
          }
          case "queue_add": {
            if (!state.queue.includes(msg.videoId)) {
              state.queue.push(msg.videoId)
              broadcast(queueMsg())
            }
            if (!state.videoId) {
              setVideo(msg.videoId, true)
            }
            break
          }
          case "queue_remove": {
            const idx = msg.index
            if (idx >= state.queue.length) break
            state.queue.splice(idx, 1)
            if (state.queueIndex >= state.queue.length) {
              state.queueIndex = state.queue.length - 1
            }
            if (state.queueIndex === idx && state.queue.length > 0) {
              const newId = state.queue[state.queueIndex]
              if (newId) {
                state.videoId = newId
                state.currentTime = 0
                state.isPlaying = true
                state.updatedAt = Date.now()
                broadcast(loadMsg(newId, state.queueIndex))
                break
              }
            }
            broadcast(queueMsg())
            if (state.queue.length === 0) {
              state.videoId = null
              state.queueIndex = -1
            }
            break
          }
          case "queue_reorder": {
            const { from, to } = msg
            if (
              from >= state.queue.length ||
              to >= state.queue.length ||
              from === to
            ) {
              break
            }
            const [videoId] = state.queue.splice(from, 1)
            state.queue.splice(to, 0, videoId)
            state.queueIndex = state.videoId
              ? state.queue.indexOf(state.videoId)
              : -1
            broadcast(queueMsg())
            break
          }
          case "queue_clear": {
            state.queue = []
            state.queueIndex = -1
            broadcast({ type: "queue", queue: state.queue, queueIndex: -1 })
            break
          }
          case "play": {
            state.currentTime = msg.currentTime
            state.isPlaying = true
            state.updatedAt = Date.now()
            broadcast({ type: "play", currentTime: state.currentTime }, socket)
            break
          }
          case "pause": {
            state.currentTime = msg.currentTime
            state.isPlaying = false
            state.updatedAt = Date.now()
            broadcast({ type: "pause", currentTime: state.currentTime }, socket)
            break
          }
          case "seek": {
            state.currentTime = msg.currentTime
            state.updatedAt = Date.now()
            broadcast({ type: "seek", currentTime: state.currentTime }, socket)
            break
          }
          case "ended": {
            const last = state.queue.length - 1
            if (state.queueIndex < last) {
              advanceTo(state.queueIndex + 1)
            } else if (state.queue.length > 1 && state.queueIndex === last) {
              advanceTo(0)
            }
            break
          }
          case "rate": {
            state.playbackRate = msg.playbackRate
            broadcast(
              { type: "rate", playbackRate: state.playbackRate },
              socket,
            )
            break
          }
          case "sync_request": {
            socket.send(JSON.stringify(getSyncPayload()))
            break
          }
          default: {
            const _exhaustive: never = msg
            void _exhaustive
          }
        }
      } catch (err) {
        console.error("ws message error", err)
      }
    },

    onError: (event) => console.error("ws error", event),
  })
})
