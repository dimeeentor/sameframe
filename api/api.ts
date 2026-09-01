/// <reference lib="deno.unstable" />
import { type Context, Hono } from "hono"
import { publicUrl } from "./state.ts"
import { createRoom, getRoomState, isValidCode, listRooms } from "./rooms.ts"
import { getSyncPayload } from "./room-state.ts"
import { VIDEO_ID_RE } from "../shared/messages.ts"
import type { RoomCode } from "../shared/messages.ts"

const api = new Hono()

api.get("/public-url", (c) => c.json({ url: publicUrl }))

// Debug: list all non-expired rooms (local only — 403 on deployed non-local host)
// Useful to inspect KV: curl http://localhost:8000/api/rooms
api.get("/rooms", async (c) => {
  // exact hostname match — a spoofed "Host: localhost.evil.com" must not pass
  const hostname = new URL(`http://${c.req.header("host") ?? "x"}`).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") {
    return c.json({ error: "not available" }, 403)
  }
  const rooms = await listRooms()
  return c.json(
    rooms.map((r) => ({
      code: r.code,
      createdAt: r.createdAt,
      videoId: r.videoId,
      queueLength: r.queue.length,
      queue: r.queue,
      clientCount: r.clientCount,
    })),
  )
})

api.post("/rooms", async (c) => {
  const meta = await createRoom()
  return c.json(meta, 201)
})

api.get("/rooms/:code", async (c) => {
  const code = c.req.param("code").toUpperCase()
  if (!isValidCode(code)) return c.json({ error: "invalid code" }, 400)
  const state = await getRoomState(code as RoomCode)
  if (!state) return c.json({ error: "room not found" }, 404)
  return c.json({ code: state.code, createdAt: state.createdAt })
})

api.get("/sync", async (c) => {
  const code = c.req.query("room")
  if (!code || !isValidCode(code.toUpperCase())) {
    return c.json({ error: "room query param required (6-char code)" }, 400)
  }
  const upper = code.toUpperCase() as RoomCode
  const state = await getRoomState(upper)
  if (!state) return c.json({ error: "room not found" }, 404)
  return c.json(getSyncPayload(state, publicUrl))
})

async function getTitle(c: Context) {
  const url = new URL(c.req.url)
  const id = url.searchParams.get("id") || url.searchParams.get("v")
  if (!id || !VIDEO_ID_RE.test(id)) {
    return c.json({ error: "invalid id" }, 400)
  }
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { headers: { "User-Agent": "Sameframe/1.0" }, signal: AbortSignal.timeout(5000) },
    )
    if (!r.ok) {
      return c.json({ id, title: id })
    }
    const j = (await r.json()) as { title?: string; author_name?: string }
    return c.json(
      { id, title: j.title ?? id, author: j.author_name ?? "" },
      200,
      { "Cache-Control": "public, max-age=86400" },
    )
  } catch {
    return c.json({ id, title: id })
  }
}

api.get("/title", getTitle)
api.get("/title/*", getTitle)

export { api }
