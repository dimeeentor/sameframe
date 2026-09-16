# sameframe: watch youtube together

i built this mostly to understand how websockets actually work under the hood —
and because my girlfriend and i use a similar service to watch youtube together
and i wanted to make our own version instead.

## privacy & safety

- **runs on cloudflare workers.** each room's video state (what's playing,
  current time, paused or not, the queue) lives in a Durable Object scoped to
  that room's code, with a 24h expiry. no accounts, no cross-room data.
- **no telemetry beyond youtube.** the only outside request is to youtube's
  nocookie player, plus an optional title lookup that proxies youtube's oembed
  endpoint. no analytics, no cookies of ours, nothing pinged back to me.
- **the websocket only broadcasts within a room.** play/pause/seek/queue events
  go to whoever's connected to that room's code, nowhere else.

## quick start (needs pnpm)

install pnpm first if you don't have it: https://pnpm.io/installation

```bash
cd <your-clone>
pnpm install       # installs frontend + backend deps (first run only)
pnpm run build     # builds the svelte frontend into frontend/dist
pnpm run dev       # builds the frontend, then runs the worker locally via wrangler dev
pnpm run check     # type-checks the backend
```

open it in two tabs, paste any youtube link (full url, short url, or just the
video id), hit play or add it to the queue — the queue stays synced and
auto-advances when a video ends, looping back around when it runs out.

## features

- nocookie youtube player, synced play/pause/seek with drift correction so
  everyone stays in step
- shared queue that pulls real video titles instead of just ids
- a room code you can hand to someone or type in to join, no fiddling with the
  url
- falls back to http polling if a network ever blocks websockets, so sync doesn't
  just break

## limitations

- tested on macos and ios so far.
- a room's state (and its websocket connections) is torn down 24h after last
  activity.

## license

mit. runs on cloudflare workers, nothing leaves the request except the
youtube iframe and title lookup.

---

_a note on em dashes: any that show up above were placed by me, by hand, with
love. yes i checked. no i will not be providing further proof._
