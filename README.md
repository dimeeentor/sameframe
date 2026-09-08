# sameframe: watch youtube together

i built this mostly to understand how websockets actually work under the
hood — and because my girlfriend and i use a similar service to watch
youtube together and i wanted to make our own version instead.

## privacy & safety

- **your mac is the server.** video state (what's playing, current time,
  paused or not, the queue) lives only in memory on your machine. no
  database, no accounts.
- **no telemetry beyond youtube.** the only outside request is to youtube's
  nocookie player, plus an optional title lookup that proxies youtube's
  oembed endpoint. no analytics, no cookies of ours, nothing pinged back to
  me.
- **the websocket stays local.** it just broadcasts play/pause/seek/queue
  events to whoever's connected.
- **public links are ephemeral.** sharing spins up a temporary tunnel to your
  local server. close the terminal and the link is gone, nothing sits on an
  external server.

## quick start (needs deno)

install deno first if you don't have it: https://deno.land

```bash
cd <your-clone>
deno task install:fe # installs the frontend's npm deps (first run only)
deno task build   # builds the svelte frontend into frontend/dist
deno task dev      # runs at http://localhost:8000, or http://<your-ip>:8000 on the same wifi
deno task share   # also gives you a public link for people outside your wifi
deno task check   # type-checks everything
```

open it in two tabs, paste any youtube link (full url, short url, or just the
video id), hit play or add it to the queue — the queue stays synced and
auto-advances when a video ends, looping back around when it runs out.

## features

- nocookie youtube player, synced play/pause/seek with drift correction so
  everyone stays in step
- shared queue that pulls real video titles instead of just ids
- music mode for audio focused sessions (hides the video, shows the cover
  art), plus light, dark or system theme, one click to cycle
- a room code you can hand to someone or type in to join, no fiddling with
  the url
- share button that copies the right link depending on whether you're
  tunneled or just on local wifi
- a compact layout that folds the header down into one menu on small screens
- falls back to http polling if a tunnel ever blocks websockets, so sync
  doesn't just break

## limitations

- no auth. anyone with the link can control playback and the queue. fine for
  friends, not for strangers.
- the public tunnel link changes every time you restart `share`, so you'll
  need to resend it.
- tested on macos and ios so far.
- if your host machine sleeps or the terminal closes, the session ends for
  everyone.

## license

mit. runs entirely on your machine, nothing leaves your network except the
youtube iframe and, if you use it, the sharing tunnel.

---

*a note on em dashes: any that show up above were placed by me, by hand, with
love. yes i checked. no i will not be providing further proof.*
