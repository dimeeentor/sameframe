import { Hono } from "hono"
import { compress } from "hono/compress"
import { api } from "./api.ts"
import { ws } from "./ws.ts"
import type { Env } from "./env.ts"

export { RoomDurableObject } from "./room-durable-object.ts"

const app = new Hono<{ Bindings: Env }>()

app.use("*", compress())

app.route("/", ws)
app.route("/api", api)

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
