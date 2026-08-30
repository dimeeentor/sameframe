import { Hono } from "hono"
import { serveStatic } from "hono/deno"
import { PORT, PUBLIC } from "./config.ts"
import { api } from "./api.ts"
import { ws } from "./ws.ts"
import { getLocalIP, startPublicTunnel } from "./tunnel.ts"

// serveStatic resolves paths against the process cwd, but the old server was
// module-relative — anchor to this file so the server works from any directory.
// Assets come from the Svelte build (frontend/dist, produced by `deno task build:fe`).
const DIST_ROOT = new URL("../frontend/dist", import.meta.url).pathname

const app = new Hono()

app.route("/", ws)
app.route("/api", api)

app.get("/", serveStatic({ root: DIST_ROOT, path: "index.html" }))
app.get("/index.html", serveStatic({ root: DIST_ROOT, path: "index.html" }))
app.use("*", serveStatic({ root: DIST_ROOT }))

app.notFound((c) => c.text("Not found", 404))

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, app.fetch)

const localIP = getLocalIP()
console.log(`\nSameframe running`)
console.log(`  local:   http://localhost:${PORT}`)
if (localIP) {
  console.log(`  network: http://${localIP}:${PORT}  ← share on same Wi-Fi`)
  console.log(`           (your Mac is host — keep this terminal open)`)
}
console.log(`  open 2 tabs to test sync\n`)
if (PUBLIC) {
  console.log(`--public flag detected — creating shareable internet URL...`)
  startPublicTunnel()
} else {
  console.log(`tip: run with --public to get a shareable internet link:`)
  console.log(
    `  deno task share   (or deno run --allow-net --allow-read --allow-run api/server.ts -- --public)\n`,
  )
}
