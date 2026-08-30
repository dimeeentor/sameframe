import { type Context, Hono } from "hono"
import { getSyncPayload, publicUrl } from "./state.ts"

const api = new Hono()

api.get("/public-url", (c) => c.json({ url: publicUrl }))

api.get("/sync", (c) => c.json(getSyncPayload()))

async function getTitle(c: Context) {
  const url = new URL(c.req.url)
  const id = url.searchParams.get("id") || url.searchParams.get("v")
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return c.json({ error: "invalid id" }, 400)
  }
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { headers: { "User-Agent": "Sameframe/1.0" } },
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
