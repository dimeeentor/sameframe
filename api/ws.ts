import { Hono } from "hono"
import { upgradeWebSocket } from "hono/deno"
import {
  broadcast,
  clients,
  estimatedTime,
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

export const ws = new Hono()

ws.get("/ws", (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected websocket", 426)
  }
  return upgradeWebSocket(c, {
    onOpen: (_event, ws) => {
      const socket = ws.raw as WebSocket
      clients.add(socket)
      console.log(`client connected (${clients.size})`)
      socket.send(JSON.stringify(getSyncPayload()))
      if (publicUrl) {
        socket.send(JSON.stringify({ type: "public_url", url: publicUrl }))
      }
      broadcast({ type: "clients", count: clients.size })
    },

    onClose: (_event, ws) => {
      clients.delete(ws.raw as WebSocket)
      console.log(`client disconnected (${clients.size})`)
      broadcast({ type: "clients", count: clients.size })
    },

    onMessage: (event, ws) => {
      const socket = ws.raw as WebSocket
      try {
        const msg = JSON.parse((event as MessageEvent).data)
        switch (msg.type) {
          case "load": {
            if (typeof msg.videoId === "string" && msg.videoId.length === 11) {
              setVideo(msg.videoId, true)
            }
            break
          }
          case "queue_add": {
            if (typeof msg.videoId === "string" && msg.videoId.length === 11) {
              if (!state.queue.includes(msg.videoId)) {
                state.queue.push(msg.videoId)
                broadcast(queueMsg())
              }

              if (!state.videoId) {
                setVideo(msg.videoId, true)
              }
            }
            break
          }
          case "queue_next": {
            if (state.queue.length > 0) {
              const next = (state.queueIndex + 1) % state.queue.length
              state.queueIndex = next
              state.videoId = state.queue[next]
              state.currentTime = 0
              state.isPlaying = true
              state.updatedAt = Date.now()
              broadcast(loadMsg(state.videoId!, next))
            }
            break
          }
          case "queue_prev": {
            if (state.queue.length > 0) {
              const prev =
                (state.queueIndex - 1 + state.queue.length) % state.queue.length
              state.queueIndex = prev
              state.videoId = state.queue[prev]
              state.currentTime = 0
              state.isPlaying = true
              state.updatedAt = Date.now()
              broadcast(loadMsg(state.videoId!, prev))
            }
            break
          }
          case "queue_remove": {
            const idx =
              typeof msg.index === "number"
                ? msg.index
                : state.queue.indexOf(msg.videoId)
            if (idx >= 0 && idx < state.queue.length) {
              state.queue.splice(idx, 1)
              if (state.queueIndex >= state.queue.length) {
                state.queueIndex = state.queue.length - 1
              }
              if (state.queueIndex === idx && state.queue.length > 0) {
                const newId = state.queue[state.queueIndex] ?? state.queue[0]
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
            }
            break
          }
          case "queue_reorder": {
            const from = msg.from
            const to = msg.to
            if (
              Number.isInteger(from) &&
              Number.isInteger(to) &&
              from >= 0 &&
              from < state.queue.length &&
              to >= 0 &&
              to < state.queue.length &&
              from !== to
            ) {
              const [videoId] = state.queue.splice(from, 1)
              state.queue.splice(to, 0, videoId)
              state.queueIndex = state.videoId
                ? state.queue.indexOf(state.videoId)
                : -1
              broadcast(queueMsg())
            }
            break
          }
          case "queue_clear": {
            state.queue = []
            state.queueIndex = -1
            broadcast({ type: "queue", queue: state.queue, queueIndex: -1 })
            break
          }
          case "play": {
            state.currentTime =
              typeof msg.currentTime === "number"
                ? msg.currentTime
                : estimatedTime()
            state.isPlaying = true
            state.updatedAt = Date.now()
            broadcast({ type: "play", currentTime: state.currentTime }, socket)
            break
          }
          case "pause": {
            state.currentTime =
              typeof msg.currentTime === "number"
                ? msg.currentTime
                : estimatedTime()
            state.isPlaying = false
            state.updatedAt = Date.now()
            broadcast({ type: "pause", currentTime: state.currentTime }, socket)
            break
          }
          case "seek": {
            state.currentTime =
              typeof msg.currentTime === "number" ? msg.currentTime : 0
            state.updatedAt = Date.now()
            broadcast({ type: "seek", currentTime: state.currentTime }, socket)
            break
          }
          case "ended": {
            if (
              state.queue.length > 0 &&
              state.queueIndex < state.queue.length - 1
            ) {
              const next = state.queueIndex + 1
              state.queueIndex = next
              state.videoId = state.queue[next]
              state.currentTime = 0
              state.isPlaying = true
              state.updatedAt = Date.now()
              broadcast(loadMsg(state.videoId!, next))
            } else if (
              state.queue.length > 1 &&
              state.queueIndex === state.queue.length - 1
            ) {
              state.queueIndex = 0
              state.videoId = state.queue[0]
              state.currentTime = 0
              state.isPlaying = true
              state.updatedAt = Date.now()
              broadcast(loadMsg(state.videoId!, 0))
            }
            break
          }
          case "rate": {
            state.playbackRate =
              typeof msg.playbackRate === "number" ? msg.playbackRate : 1
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
        }
      } catch (err) {
        console.error("ws message error", err)
      }
    },

    onError: (event) => console.error("ws error", event),
  })
})
