import { Hono } from "hono"
import { isRoomCode } from "../shared/messages.ts"
import type { Env } from "./env.ts"

export const ws = new Hono<{ Bindings: Env }>()

ws.get("/ws/:code", (c) => {
  const code = c.req.param("code").toUpperCase()
  if (!isRoomCode(code)) return c.text("invalid room code", 400)
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected websocket", 426)
  }
  const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(code))
  const headers = new Headers(c.req.raw.headers)
  headers.set("X-Room-Code", code)
  return stub.fetch(c.req.raw.url, { headers })
})
