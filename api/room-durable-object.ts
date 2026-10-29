import { DurableObject } from "cloudflare:workers"
import { CLIENT_ID_RE, isRoomCode, parseClientMsg } from "../shared/messages.ts"
import type { ClientInfo, RoomCode } from "../shared/messages.ts"
import {
  applyClientMsg,
  emptyRoomState,
  estimatedTime,
  getSyncPayload,
  type RoomState,
} from "./room-state.ts"
import type { Env } from "./env.ts"

const ROOM_TTL_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
// the TTL slides on activity, but rewriting the alarm on every play/pause is a
// second storage write per message. Hourly is close enough for a 3 day expiry.
const ALARM_REFRESH_MS = 60 * 60 * 1000
const STATE_KEY = "state"
const OWNER_KEY = "ownerToken"

// the runtime answers these from its table without waking a hibernating
// object, so clients can hold the socket open through idle proxies for free
const PING = JSON.stringify({ type: "ping" })
const PONG = JSON.stringify({ type: "pong" })
const STALE_MS = 40 * 1000

type SocketMeta = {
  connectedAt: number
  clientId: string
  label: string
  isOwner: boolean
}

function isRoomState(v: unknown): v is RoomState {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.code === "string" &&
    typeof o.createdAt === "number" &&
    Array.isArray(o.queue)
  )
}

export class RoomDurableObject extends DurableObject<Env> {
  /** when touchAlarm last wrote. Resets to 0 on a hibernation wake, which only
   *  costs one extra setAlarm. */
  private alarmSetAt = 0
  /** socket whose message last bumped rev. Lost on a hibernation wake, which
   *  only makes the stale check stricter. */
  private lastWriter: WebSocket | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  fetch(request: Request): Response {
    const url = new URL(request.url)
    const headerCode = request.headers.get("X-Room-Code")
    const code =
      headerCode && isRoomCode(headerCode) ? (headerCode as RoomCode) : null

    if (request.headers.get("Upgrade") === "websocket") {
      if (!code) return new Response("missing room code", { status: 400 })
      return this.handleWebSocketUpgrade(url)
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
    if (!existing || !isRoomState(existing)) return null
    // state stored before rev existed
    return typeof existing.rev === "number" ? existing : { ...existing, rev: 0 }
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
    const ownerToken = crypto.randomUUID()
    this.ctx.storage.kv.put(OWNER_KEY, ownerToken)
    return Response.json(
      { code: state.code, createdAt: state.createdAt, ownerToken },
      { status: 201 },
    )
  }

  private handleWebSocketUpgrade(url: URL): Response {
    const state = this.getState()
    if (!state) return new Response("room not found", { status: 404 })
    const idParam = url.searchParams.get("clientId")
    const clientId =
      idParam && CLIENT_ID_RE.test(idParam) ? idParam : crypto.randomUUID()
    const label =
      (url.searchParams.get("label") ?? "").trim().slice(0, 40) || "Viewer"
    const token = url.searchParams.get("owner")
    const isOwner =
      !!token && token === this.ctx.storage.kv.get<string>(OWNER_KEY)

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      connectedAt: Date.now(),
      clientId,
      label,
      isOwner,
    } satisfies SocketMeta)

    server.send(JSON.stringify(getSyncPayload(state)))
    this.broadcastClientCount()
    setTimeout(() => this.broadcastClientCount(), STALE_MS + 1000)

    return new Response(null, { status: 101, webSocket: client })
  }

  private isStale(ws: WebSocket, now: number): boolean {
    const meta = ws.deserializeAttachment() as SocketMeta | null
    const lastPing =
      this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0
    return now - Math.max(meta?.connectedAt ?? 0, lastPing) > STALE_MS
  }

  private liveSockets(exclude?: WebSocket | WebSocket[]): WebSocket[] {
    const skip = Array.isArray(exclude) ? exclude : [exclude]
    const now = Date.now()
    return this.ctx.getWebSockets().filter((s) => {
      if (skip.includes(s) || s.readyState !== WebSocket.OPEN) return false
      if (!this.isStale(s, now)) return true
      try {
        s.close(4000, "stale")
      } catch {}
      return false
    })
  }

  /** `exclude` is the socket this event is about: getWebSockets() can still
   *  return a socket that is closing, which would report one viewer too many. */
  private broadcastClientCount(exclude?: WebSocket | WebSocket[]) {
    const live = this.liveSockets(exclude)
    const infos = live.map((s) => {
      const meta = s.deserializeAttachment() as SocketMeta | null
      return {
        id: meta?.clientId ?? "",
        label: meta?.label ?? "Viewer",
        isOwner: meta?.isOwner === true,
      }
    })
    for (const [i, socket] of live.entries()) {
      const clients: ClientInfo[] = infos.map((c, j) => ({
        ...c,
        isYou: i === j,
      }))
      try {
        socket.send(
          JSON.stringify({ type: "clients", count: live.length, clients }),
        )
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

    if (msg.type === "kick") {
      const me = ws.deserializeAttachment() as SocketMeta | null
      if (!me?.isOwner || msg.clientId === me.clientId) return
      const kicked = this.ctx
        .getWebSockets()
        .filter(
          (s) =>
            (s.deserializeAttachment() as SocketMeta | null)?.clientId ===
            msg.clientId,
        )
      for (const s of kicked) {
        try {
          s.send(JSON.stringify({ type: "kicked" }))
          s.close(4003, "kicked")
        } catch {}
      }
      this.broadcastClientCount(kicked)
      return
    }

    const state = this.getState()
    if (!state) return

    if (msg.type === "sync_request") {
      reply(getSyncPayload(state))
      return
    }

    // playback commands carry the rev the sender last saw. A mismatch means
    // another client changed playback first, so applying it would clobber that
    // with a command based on stale state: resync the sender instead. The last
    // writer may override itself, since a play then pause faster than one RTT
    // both carry the same base rev.
    if (
      (msg.type === "play" ||
        msg.type === "pause" ||
        msg.type === "seek" ||
        msg.type === "rate") &&
      msg.rev !== undefined &&
      msg.rev !== state.rev &&
      ws !== this.lastWriter
    ) {
      reply(getSyncPayload(state))
      return
    }

    const { next, effects } = applyClientMsg(state, msg)
    if (next === null || next === state) return
    this.putState(next)
    if (next.rev !== state.rev) this.lastWriter = ws

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
    this.pauseIfEmpty(ws)
  }

  webSocketError(ws: WebSocket, error: unknown) {
    console.error("ws error", error)
    try {
      ws.close(4001, "error")
    } catch {}
    this.broadcastClientCount(ws)
    this.pauseIfEmpty(ws)
  }

  /** Nobody is watching, so stop the clock: otherwise estimatedTime keeps
   *  running and a resumed room starts far past where everyone left. */
  private pauseIfEmpty(closing: WebSocket) {
    if (this.liveSockets(closing).length) return
    const state = this.getState()
    if (!state?.isPlaying) return
    const { next } = applyClientMsg(state, {
      type: "pause",
      currentTime: estimatedTime(state),
    })
    if (next) this.putState(next)
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
