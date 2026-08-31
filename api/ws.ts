/// <reference lib="deno.unstable" />
import { Hono } from "hono"
import { upgradeWebSocket } from "hono/deno"
import { parseClientMsg } from "../shared/messages.ts"
import type { RoomCode, VideoId } from "../shared/messages.ts"
import {
  addClientToRoom,
  broadcastToRoom,
  ensureRoom,
  getRoomClientCount,
  getRoomState,
  isValidCode,
  mutateRoom,
  removeClientFromRoom,
} from "./rooms.ts"
import {
  applyLoad,
  applyPause,
  applyPlay,
  applyQueueAdd,
  applyQueueClear,
  applyQueueRemove,
  applyQueueReorder,
  applyRate,
  applySeek,
  getSyncPayload,
  handleEnded,
} from "./room-state.ts"
import { publicUrl } from "./state.ts"

const socketRooms = new WeakMap<WebSocket, RoomCode>()

export const ws = new Hono()

ws.get("/ws/:code", (c) => {
  const raw = c.req.param("code").toUpperCase()
  if (!isValidCode(raw)) return c.text("invalid room code", 400)
  const code = raw as RoomCode

  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected websocket", 426)
  }

  return upgradeWebSocket(c, {
    onOpen: async (_event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      // register synchronously before any await — avoids race where
      // client disconnects during ensureRoom and the dead socket gets
      // added after onClose already tried to remove it
      socketRooms.set(socket, code)
      addClientToRoom(code, socket)
      console.log(`client connected to ${code} (${getRoomClientCount(code)})`)

      const state = await ensureRoom(code)
      // if socket closed while we were awaiting KV, prune and don't send
      if (socket.readyState !== WebSocket.OPEN) {
        console.log(`client ${code} closed during handshake, cleaning up`)
        removeClientFromRoom(code, socket)
        socketRooms.delete(socket)
        broadcastToRoom(code, { type: "clients", count: getRoomClientCount(code) })
        return
      }

      socket.send(JSON.stringify(getSyncPayload(state, publicUrl)))
      if (publicUrl) {
        socket.send(JSON.stringify({ type: "public_url", url: publicUrl }))
      }
      broadcastToRoom(code, { type: "clients", count: getRoomClientCount(code) })
    },

    onClose: (_event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      const roomCode = socketRooms.get(socket)
      if (!roomCode) return
      removeClientFromRoom(roomCode, socket)
      socketRooms.delete(socket)
      console.log(`client disconnected from ${roomCode} (${getRoomClientCount(roomCode)})`)
      broadcastToRoom(roomCode, { type: "clients", count: getRoomClientCount(roomCode) })
    },

    onError: (event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) {
        console.error("ws error", event)
        return
      }
      const roomCode = socketRooms.get(socket)
      if (!roomCode) {
        console.error("ws error (no room)", event)
        return
      }
      console.error("ws error in room", roomCode, event)
      removeClientFromRoom(roomCode, socket)
      socketRooms.delete(socket)
      broadcastToRoom(roomCode, { type: "clients", count: getRoomClientCount(roomCode) })
    },

    onMessage: async (event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      if (typeof event.data !== "string") return
      const roomCode = socketRooms.get(socket)
      if (!roomCode) return

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
            const res = await mutateRoom(roomCode, (s) => applyLoad(s, msg.videoId))
            if (!res.ok) return
            broadcastToRoom(roomCode, {
              type: "load",
              videoId: msg.videoId,
              currentTime: 0,
              isPlaying: true,
              queue: res.state.queue,
              queueIndex: res.state.queueIndex,
            })
            break
          }
          case "queue_add": {
            // add then, if was empty, also load
            const before = await getRoomState(roomCode)
            if (!before) return
            const wasEmpty = before.queue.length === 0 && !before.videoId
            const addRes = await mutateRoom(roomCode, (s) => {
              if (s.queue.includes(msg.videoId)) return null
              return applyQueueAdd(s, msg.videoId)
            })
            if (!addRes.ok) return
            // only broadcast queue if we actually added
            if (before.queue.length !== addRes.state.queue.length) {
              broadcastToRoom(roomCode, {
                type: "queue",
                queue: addRes.state.queue,
                queueIndex: addRes.state.queueIndex,
              })
            }
            if (wasEmpty) {
              const loadRes = await mutateRoom(roomCode, (s) => applyLoad(s, msg.videoId))
              if (!loadRes.ok) return
              broadcastToRoom(roomCode, {
                type: "load",
                videoId: msg.videoId,
                currentTime: 0,
                isPlaying: true,
                queue: loadRes.state.queue,
                queueIndex: loadRes.state.queueIndex,
              })
            }
            break
          }
          case "queue_remove": {
            const before = await getRoomState(roomCode)
            if (!before) return
            if (msg.index < 0 || msg.index >= before.queue.length) break

            // if removing the currently playing index and something remains -> load next
            const removingCurrent = before.queueIndex === msg.index && before.queue.length > 1
            if (removingCurrent) {
              // determine which id will be current after removal
              const queueAfter = before.queue.filter((_, i) => i !== msg.index)
              let newIndex = before.queueIndex
              if (newIndex >= queueAfter.length) newIndex = queueAfter.length - 1
              const newId = queueAfter[newIndex]
              if (newId) {
                const res = await mutateRoom(roomCode, (s) => {
                  // remove then set video to newId
                  const removed = applyQueueRemove(s, msg.index)
                  // removed.queue is queueAfter, now load newId
                  const idx = removed.queue.indexOf(newId as VideoId)
                  return {
                    ...removed,
                    videoId: newId as VideoId,
                    queueIndex: idx,
                    currentTime: 0,
                    isPlaying: true,
                    updatedAt: Date.now(),
                  }
                })
                if (!res.ok) return
                broadcastToRoom(roomCode, {
                  type: "load",
                  videoId: newId,
                  currentTime: 0,
                  isPlaying: true,
                  queue: res.state.queue,
                  queueIndex: res.state.queueIndex,
                })
                break
              }
            }

            const res = await mutateRoom(roomCode, (s) => {
              const after = applyQueueRemove(s, msg.index)
              // if empty, clear videoId
              if (after.queue.length === 0) {
                return { ...after, videoId: null, queueIndex: -1 }
              }
              return after
            })
            if (!res.ok) return
            broadcastToRoom(roomCode, {
              type: "queue",
              queue: res.state.queue,
              queueIndex: res.state.queueIndex,
            })
            break
          }
          case "queue_reorder": {
            const res = await mutateRoom(roomCode, (s) =>
              applyQueueReorder(s, msg.from, msg.to)
            )
            if (!res.ok) return
            // no-op check: queue unchanged
            if (res.state.queue.length === 0) break
            broadcastToRoom(roomCode, {
              type: "queue",
              queue: res.state.queue,
              queueIndex: res.state.queueIndex,
            })
            break
          }
          case "queue_clear": {
            const res = await mutateRoom(roomCode, (s) => applyQueueClear(s))
            if (!res.ok) return
            broadcastToRoom(roomCode, { type: "queue", queue: [], queueIndex: -1 })
            break
          }
          case "play": {
            const res = await mutateRoom(roomCode, (s) => applyPlay(s, msg.currentTime))
            if (!res.ok) return
            broadcastToRoom(roomCode, { type: "play", currentTime: res.state.currentTime }, socket)
            break
          }
          case "pause": {
            const res = await mutateRoom(roomCode, (s) => applyPause(s, msg.currentTime))
            if (!res.ok) return
            broadcastToRoom(roomCode, { type: "pause", currentTime: res.state.currentTime }, socket)
            break
          }
          case "seek": {
            const res = await mutateRoom(roomCode, (s) => applySeek(s, msg.currentTime))
            if (!res.ok) return
            broadcastToRoom(roomCode, { type: "seek", currentTime: res.state.currentTime }, socket)
            break
          }
          case "ended": {
            const res = await mutateRoom(roomCode, (s) => {
              const next = handleEnded(s)
              return next ?? null
            })
            if (!res.ok) return
            // find which index we advanced to
            broadcastToRoom(roomCode, {
              type: "load",
              videoId: res.state.videoId!,
              currentTime: 0,
              isPlaying: true,
              queue: res.state.queue,
              queueIndex: res.state.queueIndex,
            })
            break
          }
          case "rate": {
            const res = await mutateRoom(roomCode, (s) => applyRate(s, msg.playbackRate))
            if (!res.ok) return
            broadcastToRoom(roomCode, { type: "rate", playbackRate: res.state.playbackRate }, socket)
            break
          }
          case "sync_request": {
            const state = await getRoomState(roomCode)
            if (!state) return
            socket.send(JSON.stringify(getSyncPayload(state, publicUrl)))
            break
          }
          default: {
            const _exhaustive: never = msg
            void _exhaustive
          }
        }
      } catch (err) {
        console.error(`ws message error in room ${roomCode}`, err)
      }
    },
  })
})
