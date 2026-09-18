import { type Context, Hono } from "hono"
import { generateRoomCode } from "./room-code.ts"
import { getSyncPayload, type RoomState } from "./room-state.ts"
import { isRoomCode, VIDEO_ID_RE } from "../shared/messages.ts"
import type { RoomCode } from "../shared/messages.ts"
import type { Env } from "./env.ts"

const api = new Hono<{ Bindings: Env }>()

async function fetchRoomState(env: Env, code: RoomCode): Promise<RoomState | null> {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
  const res = await stub.fetch("https://room/state", {
    headers: { "X-Room-Code": code },
  })
  if (res.status === 404) return null
  return res.json()
}

api.post("/rooms", async (c) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode()
    const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(code))
    const res = await stub.fetch("https://room/create", {
      method: "POST",
      headers: { "X-Room-Code": code },
    })
    if (res.status === 201) return c.json(await res.json(), 201)
    // 409: code collision, retry with a new code
  }
  return c.json({ error: "failed to generate unique room code" }, 500)
})

api.get("/rooms/:code", async (c) => {
  const code = c.req.param("code").toUpperCase()
  if (!isRoomCode(code)) return c.json({ error: "invalid code" }, 400)
  const state = await fetchRoomState(c.env, code as RoomCode)
  if (!state) return c.json({ error: "room not found" }, 404)
  return c.json({ code: state.code, createdAt: state.createdAt })
})

api.get("/sync", async (c) => {
  const code = c.req.query("room")
  if (!code || !isRoomCode(code.toUpperCase())) {
    return c.json({ error: "room query param required (6-char code)" }, 400)
  }
  const upper = code.toUpperCase() as RoomCode
  const state = await fetchRoomState(c.env, upper)
  if (!state) return c.json({ error: "room not found" }, 404)
  return c.json(getSyncPayload(state))
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
      {
        headers: { "User-Agent": "Sameframe/1.0" },
        signal: AbortSignal.timeout(5000),
      },
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
