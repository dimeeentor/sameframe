/** Reactive boundary — owns room boot (create-or-join via ?room=). No legacy default room. */
import { createSession } from "../app/session.ts"
import { createTransport } from "../app/transport.ts"
import { createPlayer } from "../app/player.ts"
import { parseRoomCode } from "../app/domain.ts"
import type { RoomCode, SyncSnapshot } from "../app/domain.ts"

function getRoomFromUrl(): RoomCode | null {
  const v = new URLSearchParams(location.search).get("room")
  if (!v) return null
  return parseRoomCode(v)
}

async function ensureRoomCode(): Promise<RoomCode> {
  const existing = getRoomFromUrl()
  if (existing) return existing

  // no ?room= — create one and rewrite URL
  const res = await fetch("/api/rooms", { method: "POST" })
  if (!res.ok) throw new Error("failed to create room")
  const data = (await res.json()) as { code: string }
  const code = parseRoomCode(data.code)
  if (!code) throw new Error("invalid room code from server")
  const url = new URL(location.href)
  url.searchParams.set("room", code)
  history.replaceState(null, "", url.toString())
  return code
}

let _session: ReturnType<typeof createSession> | null = null
let _code: RoomCode | null = getRoomFromUrl()

export const view = $state<SyncSnapshot>({
  videoId: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  playbackRate: 1,
  publicUrl: null,
  shareUrl: location.href,
  viewerCount: 0,
  connection: "connecting",
  roomCode: null,
})

const ready: Promise<void> = (async () => {
  const code = await ensureRoomCode()
  _code = code
  const transport = createTransport(code)
  _session = createSession(transport, createPlayer(), code)
  _session.subscribe((snap) => Object.assign(view, snap))
  _session.start()
})().catch((e) => console.error("[sameframe] room init failed", e))

function getSession(): ReturnType<typeof createSession> {
  if (!_session) throw new Error("session not ready yet")
  return _session
}

export const session = {
  start() {},
  stop() { _session?.stop() },
  attachPlayer(host: HTMLElement) {
    if (_session) _session.attachPlayer(host)
    else void ready.then(() => _session!.attachPlayer(host))
  },
  subscribe(cb: (s: SyncSnapshot) => void) {
    if (_session) return _session.subscribe(cb)
    let off: () => void = () => {}
    void ready.then(() => { off = _session!.subscribe(cb) })
    return () => off()
  },
  loadVideo(id: Parameters<ReturnType<typeof createSession>["loadVideo"]>[0]) { getSession().loadVideo(id) },
  addToQueue(id: Parameters<ReturnType<typeof createSession>["addToQueue"]>[0]) { getSession().addToQueue(id) },
  removeFromQueue(i: number) { getSession().removeFromQueue(i) },
  reorderQueue(a: number, b: number) { getSession().reorderQueue(a, b) },
  clearQueue() { getSession().clearQueue() },
  togglePlay() { getSession().togglePlay() },
  seekBy(d: number) { getSession().seekBy(d) },
  toggleFullscreen() { getSession().toggleFullscreen() },
  /** Create new room and navigate to it */
  async createNewRoom() {
    const res = await fetch("/api/rooms", { method: "POST" })
    if (!res.ok) throw new Error("failed to create room")
    const data = (await res.json()) as { code: string }
    location.href = `${location.origin}/?room=${data.code}`
  },
  /** Join existing room by code */
  joinRoom(code: string) {
    const parsed = parseRoomCode(code)
    if (!parsed) throw new Error("invalid room code")
    location.href = `${location.origin}/?room=${parsed}`
  },
  get roomCode() { return _code },
}
