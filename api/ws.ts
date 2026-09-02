/// <reference lib="deno.unstable" />
import { Hono } from "hono"
import { upgradeWebSocket } from "hono/deno"
import { isRoomCode, parseClientMsg } from "../shared/messages.ts"
import type { RoomCode } from "../shared/messages.ts"
import { addClient, broadcast, clientCount, removeClient } from "./presence.ts"
import { applyClientMsg, type Effect, getSyncPayload } from "./room-state.ts"
import { ensureRoom, getRoomState, mutateRoom } from "./rooms.ts"
import { publicUrl } from "./state.ts"

const socketRooms = new WeakMap<WebSocket, RoomCode>()

export const ws = new Hono()

ws.get("/ws/:code", (c) => {
  const raw = c.req.param("code").toUpperCase()
  if (!isRoomCode(raw)) return c.text("invalid room code", 400)
  const code = raw

  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected websocket", 426)
  }

  return upgradeWebSocket(c, {
    onOpen: async (_event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      // register synchronously before any await. Otherwise a client that
      // disconnects during ensureRoom leaves a dead socket that gets added
      // after onClose already tried to remove it
      socketRooms.set(socket, code)
      addClient(code, socket)
      console.log(`client connected to ${code} (${clientCount(code)})`)

      const state = await ensureRoom(code)
      // if socket closed while we were awaiting KV, prune and don't send
      if (socket.readyState !== WebSocket.OPEN) {
        console.log(`client ${code} closed during handshake, cleaning up`)
        removeClient(code, socket)
        socketRooms.delete(socket)
        broadcast(code, { type: "clients", count: clientCount(code) })
        return
      }

      socket.send(JSON.stringify(getSyncPayload(state, publicUrl)))
      if (publicUrl) {
        socket.send(JSON.stringify({ type: "public_url", url: publicUrl }))
      }
      broadcast(code, { type: "clients", count: clientCount(code) })
    },

    onClose: (_event, ws) => {
      const socket = ws.raw
      if (!(socket instanceof WebSocket)) return
      const roomCode = socketRooms.get(socket)
      if (!roomCode) return
      removeClient(roomCode, socket)
      socketRooms.delete(socket)
      console.log(
        `client disconnected from ${roomCode} (${clientCount(roomCode)})`,
      )
      broadcast(roomCode, { type: "clients", count: clientCount(roomCode) })
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
      removeClient(roomCode, socket)
      socketRooms.delete(socket)
      broadcast(roomCode, { type: "clients", count: clientCount(roomCode) })
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
        if (msg.type === "sync_request") {
          const state = await getRoomState(roomCode)
          if (state) {
            socket.send(JSON.stringify(getSyncPayload(state, publicUrl)))
          }
          return
        }
        let effects: Effect[] = []
        const res = await mutateRoom(roomCode, (s) => {
          const t = applyClientMsg(s, msg)
          effects = t.effects
          return t.next
        })
        if (!res.ok) return
        for (const e of effects) {
          if (e.kind === "broadcast") {
            broadcast(roomCode, e.msg, e.excludeSelf ? socket : undefined)
          } else {
            socket.send(JSON.stringify(e.msg))
          }
        }
      } catch (err) {
        console.error(`ws message error in room ${roomCode}`, err)
      }
    },
  })
})
