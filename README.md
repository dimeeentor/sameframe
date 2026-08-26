# SyncTube: watch YouTube together

I built this mostly to understand how WebSockets actually work under the hood,
and because my girlfriend and I use a similar service to watch YouTube together.
I wanted to make our own version instead.

## Privacy & Safety

- **Your Mac is the server.** Video state (what's playing, current time, paused
  or not, the queue) lives only in memory on your machine. No database, no
  accounts.
- **No telemetry beyond YouTube.** The only outside request is to YouTube's
  nocookie player, plus an optional title lookup that proxies YouTube's oEmbed
  endpoint. No analytics, no cookies of ours, nothing pinged back to me.
- **The WebSocket stays local.** It just broadcasts play/pause/seek/queue events
  to whoever's connected.
- **Public links are ephemeral.** Sharing spins up a temporary tunnel to your
  local server. Close the terminal and the link is gone; nothing sits on an
  external server.

## Quick start (needs Deno)

Install Deno first if you don't have it: https://deno.land

```bash
cd youtube-sync
deno task build   # compiles the TS client to JS
deno task dev      # runs at http://localhost:8000, or http://<your-ip>:8000 on the same Wi-Fi
deno task share   # also gives you a public link for people outside your Wi-Fi
deno task check   # type-checks everything
```

Open it in two tabs, paste any YouTube link (full URL, short URL, or just the
video ID), hit Play or add it to the queue. The queue stays synced and
auto-advances when a video ends, looping back around when it runs out.

## Features

- Nocookie YouTube player, synced play/pause/seek with drift correction so
  everyone stays in step
- Shared queue that pulls real video titles instead of just IDs
- Music mode for audio focused sessions (hides the video, shows the cover art),
  plus light/dark theme
- Share button that copies the right link depending on whether you're tunneled
  or just on local Wi-Fi
- Falls back to HTTP polling if a tunnel ever blocks WebSockets, so sync doesn't
  just break

## Limitations

- No auth. Anyone with the link can control playback and the queue. Fine for
  friends, not for strangers.
- The public tunnel link changes every time you restart `share`, so you'll need
  to resend it.
- Tested on macOS and iOS so far.
- If your host machine sleeps or the terminal closes, the session ends for
  everyone.

## Stack

Deno on the backend with native WebSockets, TypeScript on the client. No
bundler, no node_modules at runtime. About as lightweight as this kind of thing
gets.

## License

MIT. Runs entirely on your machine; nothing leaves your network except the
YouTube iframe and, if you use it, the sharing tunnel.
