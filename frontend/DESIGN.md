# Frontend design (arena synthesis)

## Problem

Replace the 929-line vanilla-TS `public/app.ts` with a Svelte 5 app in `frontend/`, preserving full behavior parity against an unchanged backend wire contract (Hono on Deno: `/ws`, `/api/*`, static files). The domain is hard in one specific way: sync correctness is policy over interleaved imperative event sources — a WS stream with an HTTP-poll fallback, an outside-reactivity YouTube iframe player, suppression windows that attribute "our command" vs "a human" events, and a 400ms drift tick. The backend broadcasts `load`/`queue` messages back to their sender and has no ack/correlation IDs, so echo handling must be solved client-side as idempotent reduction.

Constraints honored: no wire changes; frontend code confined to `frontend/`; build output served by the Hono server; Deno runtime, minimal node tooling; visual parity by reusing `public/style.css`; iOS Safari `playsinline`; no router.

## Usage (caller's view)

Components import four things and nothing else: `view` (reactive snapshot of sync state), `session` (command methods), `titleOf`/`ensureTitle` (title cache), `settings` (theme + music mode). No component sees `WebSocket`, `fetch` (except titles), `YT.*`, wire types, or `Date.now()`-based suppression.

- `App.svelte` calls `session.start()`/`stop()` on mount, owns keyboard shortcuts, `document.title`, and `?v=` history sync.
- `UrlBar.svelte` parses input via `parseVideoId`, then one call: `session.loadVideo(id)` or `session.addToQueue(id)`.
- `QueueList.svelte` reads `view.queue`, emits one call per intent: `session.loadVideo / removeFromQueue / reorderQueue`.
- `Player.svelte` renders the mount div and calls `session.attachPlayer(host)` once; shows placeholder/cover from `view.videoId` + `settings.musicMode`.

## Shape

Non-reactive core, narrow reactive boundary. Import direction: `ui/* → state/*.svelte.ts → app/session.ts → { transport.ts, player.ts, wire.ts, domain.ts }`. Chains never exceed two hops.

```
frontend/
  index.html                  # inline YT-ready stub (load-bearing, kept verbatim)
  public/icon.png             # vite copies to dist/
  vite.config.ts              # svelte plugin; dev proxy /api + /ws → :8000
  src/
    main.ts  app.css          # app.css = public/style.css ported
    app/
      domain.ts               # VideoId brand, parseVideoId, ConnectionStatus, SyncSnapshot, thumb/fmt/isTypingTarget
      wire.ts                 # ServerMsg/ClientMsg + parseServerMsg (imported only by session/transport)
      transport.ts            # WS lifecycle + poll fallback → one ServerMsg stream
      player.ts               # YT wrapper: handshake race, 4s retry, command buffering, PlayerEvent facts
      session.ts              # THE deep module: reduce + policy + commands + suppression + drift
    state/
      session.svelte.ts       # `view` ($state) + `session` singleton — the whole reactive boundary
      titles.svelte.ts        # SvelteMap cache + inflight dedup + /api/title fetch
      settings.svelte.ts      # theme/musicMode, localStorage, data-theme/body.music side effects
    ui/                       # App, Header, UrlBar, Player, QueueList, QueueRow, ShortcutsPanel
```

Key invariants encoded in structure: `VideoId` brand means unvalidated strings can't reach `session.loadVideo`; validation lives in exactly two places (`parseVideoId` for user input, `parseServerMsg` for the network); server owns queue truth (its echo always overwrites optimistic state); the local player owns play state (tick re-derives it every 400ms); the `load` reducer is idempotent under own-echo (server includes the sender in `load`/`queue` broadcasts — reloading would restart playback).

## Synthesis decision

Base: the **session-controller / thin-reactive-shell** candidate. The core's hard problems are ordering and time; a plain-TS core with explicit `reduce()`/`publish()` points keeps those legible and is testable under `deno test` with fake transport/player, while reactivity enters through one ~15-line boundary module. The store-first candidate's `SyncStore` exposed its merge machinery (`server`, `pending`, `ingestServer`) on its public surface — leakage by the red-flags definition.

Adapted from the store-first candidate: strict wire/domain separation with parse-at-boundary; the sender-included-broadcast proof, which turns "echo suppression" into an idempotent-reducer requirement; the build/serving plan (both candidates converged on `frontend/dist` + `deno run -A npm:vite`). Rejected: the expectation ledger (value-matched suppression) — attractive but higher implementation risk than the blanket suppression window for v1; recorded as a future improvement. Rejected: `anchorTime` room-clock extrapolation — the server already extrapolates in `estimatedTime()`. Chosen over a `package.json`-less pure-Deno vite setup: a minimal `frontend/package.json` (4 dev deps) is the battle-tested path for the svelte plugin while still running vite through Deno.

## Tradeoffs accepted

- Optimistic write, then authoritative server echo converges the UI — instant feedback over slow tunnel links at the cost of transient divergence.
- Blanket suppression window (800–1500ms) can drop a genuine user action that lands inside it — parity with the old app, accepted for v1.
- Manual `publish()` after each mutation; a missed call shows as stale UI, so mutation is funneled through private helpers.
- The 2s failure poll and 2.5s safety poll collapse into one poll timer while the WS is down (net behavior identical).
- Clicking the queue row for the already-active video no longer restarts it (own-echo idempotence fix); "replay" is re-addable as an explicit intent if wanted.
- Vite + node_modules enter the repo despite the lightweight ethos; mitigated by running vite through `deno run -A npm:vite` and deleting `build.ts`.

## Alternatives considered

- Store-first runes-native (the other runner candidate): lost on interface depth — it exposed merge internals and kept suppression/policy in a controller layer adjacent to, not behind, the store.
- State-in-App (all state in `App.svelte`, context/props down): a god component holding transport, policy, and view state; untestable outside component mounts.
- Zero-optimistic thin client (UI updates only from server echoes): seconds of visible lag on the poll path; the reducer must still handle own-echo idempotently, so the simplification is smaller than it looks.

## Open questions and risks

- Should the YT-ready stub move from `index.html` into `player.ts` (injected)? Kept verbatim in `index.html` for parity; the handshake contract therefore spans two files.
- Deno + vite + svelte plugin is the least-tested corner; `frontend/package.json` is the fallback (already chosen as primary).
- iOS Safari autoplay of server-driven loads before any user gesture — same as before, confirm on device.

## Next implementation step

`domain.ts` + `wire.ts` + `transport.ts` proven end-to-end against the running API (status bar rendering live state), then `player.ts`/`session.ts`, then components.
