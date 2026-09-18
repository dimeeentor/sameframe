import { DurableObject } from "cloudflare:workers"
import { isRoomCode, parseClientMsg } from "../shared/messages.ts"
import type { RoomCode } from "../shared/messages.ts"
import { applyClientMsg, emptyRoomState, getSyncPayload, type RoomState } from "./room-state.ts"
import type { Env } from "./env.ts"

const ROOM_TTL_MS = 24 * 60 * 60 * 1000 // 24h
// the TTL slides on activity, but rewriting the alarm on every play/pause is a
// second storage write per message. Hourly is close enough for a 24h expiry.
const ALARM_REFRESH_MS = 60 * 60 * 1000
const STATE_KEY = "state"

// the runtime answers these from its table without waking a hibernating
// object, so clients can hold the socket open through idle proxies for free
const PING = JSON.stringify({ type: "ping" })
const PONG = JSON.stringify({ type: "pong" })

function isRoomState(v: unknown): v is RoomState {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.code === "string" && typeof o.createdAt === "number" &&
    Array.isArray(o.queue)
}

export class RoomDurableObject extends DurableObject<Env> {
  /** when touchAlarm last wrote. Resets to 0 on a hibernation wake, which only
   *  costs one extra setAlarm. */
  private alarmSetAt = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  fetch(request: Request): Response {
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
      const state = this.getState()
      return state ? Response.json(state) : new Response(null, { status: 404 })
    }
    return new Response("not found", { status: 404 })
  }

  /** SQLite-backed Durable Objects expose storage synchronously, so every read
   *  and write below is a plain call: no await anywhere on the message path. */
  private getState(): RoomState | null {
    const existing = this.ctx.storage.kv.get<RoomState>(STATE_KEY)
    return existing && isRoomState(existing) ? existing : null
  }

  /** Writes are not awaited: the output gate holds outgoing messages until they
   *  land, so nothing can observe state that failed to persist. */
  private putState(state: RoomState): void {
    this.ctx.storage.kv.put(STATE_KEY, state)
    this.touchAlarm()
  }

  private touchAlarm(): void {
    const now = Date.now()
    if (now - this.alarmSetAt < ALARM_REFRESH_MS) return
    this.alarmSetAt = now
    void this.ctx.storage.setAlarm(now + ROOM_TTL_MS)
  }

  private ensureRoom(code: RoomCode): RoomState {
    const existing = this.getState()
    if (existing) return existing
    const state = emptyRoomState(code)
    this.putState(state)
    return state
  }

  private handleCreate(code: RoomCode): Response {
    if (this.getState()) return new Response(null, { status: 409 })
    const state = this.ensureRoom(code)
    return Response.json({ code: state.code, createdAt: state.createdAt }, { status: 201 })
  }

  private handleWebSocketUpgrade(code: RoomCode): Response {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)

    server.send(JSON.stringify(getSyncPayload(this.ensureRoom(code))))
    this.broadcastClientCount()

    return new Response(null, { status: 101, webSocket: client })
  }

  /** `exclude` is the socket this event is about: getWebSockets() can still
   *  return a socket that is closing, which would report one viewer too many. */
  private broadcastClientCount(exclude?: WebSocket) {
    const live = this.ctx.getWebSockets().filter((s) => s !== exclude)
    const data = JSON.stringify({ type: "clients", count: live.length })
    for (const socket of live) {
      try {
        socket.send(data)
      } catch {
        // dead socket; webSocketClose/webSocketError will prune it
      }
    }
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

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
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

    const state = this.getState()
    if (!state) return

    if (msg.type === "sync_request") {
      reply(getSyncPayload(state))
      return
    }

    const { next, effects } = applyClientMsg(state, msg)
    if (next === null || next === state) return
    this.putState(next)

    for (const effect of effects) {
      if (effect.kind === "broadcast") {
        this.broadcast(effect.msg, effect.excludeSelf ? ws : undefined)
      } else {
        reply(effect.msg)
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string) {
    // completes the closing handshake instead of leaving the socket half-open.
    // Only 1000 and 3000-4999 may be sent back, so anything else becomes 1000.
    try {
      ws.close(code >= 3000 && code <= 4999 ? code : 1000, reason)
    } catch {
      // already closed
    }
    this.broadcastClientCount(ws)
  }

  webSocketError(ws: WebSocket, error: unknown) {
    console.error("ws error", error)
    this.broadcastClientCount(ws)
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
