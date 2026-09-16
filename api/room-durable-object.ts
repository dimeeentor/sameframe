import { DurableObject } from "cloudflare:workers"
import { isRoomCode, parseClientMsg } from "../shared/messages.ts"
import type { RoomCode } from "../shared/messages.ts"
import { applyClientMsg, emptyRoomState, getSyncPayload, type RoomState } from "./room-state.ts"
import type { Env } from "./env.ts"

const ROOM_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const STATE_KEY = "state"

function isRoomState(v: unknown): v is RoomState {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.code === "string" && typeof o.createdAt === "number" &&
    Array.isArray(o.queue)
}

export class RoomDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const headerCode = request.headers.get("X-Room-Code")
    const code = headerCode && isRoomCode(headerCode) ? headerCode as RoomCode : null

    if (request.headers.get("Upgrade") === "websocket") {
      if (!code) return new Response("missing room code", { status: 400 })
      return this.handleWebSocketUpgrade(code)
    }
    if (url.pathname === "/create" && request.method === "POST") {
      if (!code) return new Response("missing room code", { status: 400 })
      return this.handleCreate(code)
    }
    if (url.pathname === "/state") {
      const state = await this.getState()
      return state ? Response.json(state) : new Response(null, { status: 404 })
    }
    return new Response("not found", { status: 404 })
  }

  private async getState(): Promise<RoomState | null> {
    const existing = await this.ctx.storage.get<RoomState>(STATE_KEY)
    return existing && isRoomState(existing) ? existing : null
  }

  private async ensureRoom(code: RoomCode): Promise<RoomState> {
    const existing = await this.getState()
    if (existing) return existing
    const state = emptyRoomState(code)
    await this.ctx.storage.put(STATE_KEY, state)
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS)
    return state
  }

  private async handleCreate(code: RoomCode): Promise<Response> {
    const existing = await this.getState()
    if (existing) return new Response(null, { status: 409 })
    const state = await this.ensureRoom(code)
    return Response.json({ code: state.code, createdAt: state.createdAt }, { status: 201 })
  }

  private async handleWebSocketUpgrade(code: RoomCode): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)

    const state = await this.ensureRoom(code)
    try {
      server.send(JSON.stringify(getSyncPayload(state, null)))
    } catch {
      // client disconnected while ensureRoom was awaiting storage
    }
    this.broadcastClientCount()

    return new Response(null, { status: 101, webSocket: client })
  }

  private broadcastClientCount() {
    this.broadcast({ type: "clients", count: this.ctx.getWebSockets().length })
  }

  private broadcast(msg: unknown, exclude?: WebSocket) {
    const data = JSON.stringify(msg)
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue
      try {
        socket.send(data)
      } catch {
        // dead socket; webSocketClose/webSocketError will prune it
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return
    let raw: unknown
    try {
      raw = JSON.parse(message)
    } catch {
      return
    }
    const msg = parseClientMsg(raw)
    if (!msg) return

    const reply = (m: unknown) => {
      try {
        ws.send(JSON.stringify(m))
      } catch {
        // dead socket
      }
    }

    if (msg.type === "sync_request") {
      const state = await this.getState()
      if (state) reply(getSyncPayload(state, null))
      return
    }

    const state = await this.getState()
    if (!state) return
    const { next, effects } = applyClientMsg(state, msg)
    if (next === null || next === state) return
    await this.ctx.storage.put(STATE_KEY, next)
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS)

    for (const effect of effects) {
      if (effect.kind === "broadcast") {
        this.broadcast(effect.msg, effect.excludeSelf ? ws : undefined)
      } else {
        reply(effect.msg)
      }
    }
  }

  webSocketClose() {
    this.broadcastClientCount()
  }

  webSocketError(_ws: WebSocket, error: unknown) {
    console.error("ws error", error)
    this.broadcastClientCount()
  }

  async alarm() {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(1000, "room expired")
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAll()
  }
}
