/** Reactive boundary. Owns room boot (create-or-join via ?room=). */
import { tick } from "svelte"
import { createSession } from "../app/session.ts"
import { createTransport } from "../app/transport.ts"
import { createPlayer } from "../app/player.ts"
import { parseRoomCode } from "../app/domain.ts"
import type { RoomCode, SyncSnapshot, VideoId } from "../app/domain.ts"

const ownerKey = (code: string) => `sameframe:owner:${code}`
const getToken = (code: string | null): string | null => {
  try {
    return code ? localStorage.getItem(ownerKey(code)) : null
  } catch {
    return null
  }
}
const saveToken = (code: string, token: string) => {
  try {
    localStorage.setItem(ownerKey(code), token)
  } catch {}
}

function getRoomFromUrl(): RoomCode | null {
  const v = new URLSearchParams(location.search).get("room")
  if (!v) return null
  return parseRoomCode(v)
}

function claimFromHash() {
  const m = location.hash.match(/^#claim=([^&]+)/)
  const code = getRoomFromUrl()
  if (!m) return
  if (code) saveToken(code, decodeURIComponent(m[1]))
  history.replaceState(null, "", location.pathname + location.search)
}
claimFromHash()

async function ensureRoomCode(): Promise<RoomCode> {
  const existing = getRoomFromUrl()
  if (existing) return existing

  // no ?room=, so create one and rewrite the URL
  const res = await fetch("/api/rooms", { method: "POST" })
  if (!res.ok) throw new Error("failed to create room")
  const data = (await res.json()) as { code: string; ownerToken?: string }
  const code = parseRoomCode(data.code)
  if (!code) throw new Error("invalid room code from server")
  if (data.ownerToken) saveToken(code, data.ownerToken)
  const url = new URL(location.href)
  url.searchParams.set("room", code)
  history.replaceState(null, "", url.toString())
  return code
}

let _session: ReturnType<typeof createSession> | null = null
let _code: RoomCode | null = getRoomFromUrl()

type Session = ReturnType<typeof createSession>

/** Run once the session exists; actions arriving during room boot are queued
 *  on `ready` instead of throwing. */
function whenReady(fn: (s: Session) => void) {
  if (_session) fn(_session)
  else {
    void ready.then(() => {
      if (_session) fn(_session)
    })
  }
}

export const view = $state<SyncSnapshot>({
  videoId: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  playbackRate: 1,
  shareUrl: location.href,
  viewerCount: 0,
  connection: "connecting",
  roomCode: null,
  joined: false,
  viewers: [],
  isOwner: false,
  kicked: false,
})

function startSession(code: RoomCode) {
  const transport = createTransport(code, { ownerToken: () => getToken(code) })
  _session = createSession(transport, createPlayer(), code)
  _session.subscribe((snap) => Object.assign(view, snap))
  _session.start()
}

const ready: Promise<void> = (async () => {
  const code = await ensureRoomCode()
  _code = code
  startSession(code)
})().catch((e) => console.error("[sameframe] room init failed", e))

export const session = {
  start() {},
  stop() {
    _session?.stop()
  },
  attachPlayer(host: HTMLElement) {
    whenReady((s) => s.attachPlayer(host))
  },
  join() {
    if (_session) _session.join()
    else whenReady((s) => s.join())
  },
  subscribe(cb: (s: SyncSnapshot) => void) {
    if (_session) return _session.subscribe(cb)
    let off: () => void = () => {}
    void ready.then(() => {
      off = _session!.subscribe(cb)
    })
    return () => off()
  },
  loadVideo(id: VideoId) {
    whenReady((s) => s.loadVideo(id))
  },
  addToQueue(id: VideoId) {
    whenReady((s) => s.addToQueue(id))
  },
  removeFromQueue(i: number) {
    whenReady((s) => s.removeFromQueue(i))
  },
  reorderQueue(a: number, b: number) {
    whenReady((s) => s.reorderQueue(a, b))
  },
  clearQueue() {
    whenReady((s) => s.clearQueue())
  },
  togglePlay() {
    whenReady((s) => s.togglePlay())
  },
  seekBy(d: number) {
    whenReady((s) => s.seekBy(d))
  },
  toggleFullscreen() {
    whenReady((s) => s.toggleFullscreen())
  },
  kick(clientId: string) {
    whenReady((s) => s.kick(clientId))
  },
  ownerLink(): string | null {
    const token = getToken(_code)
    return token ? `${location.origin}/?room=${_code}#claim=${token}` : null
  },
  async rejoin() {
    if (!_code || !view.kicked) return
    _session?.stop()
    startSession(_code)
    Object.assign(view, { kicked: false })
    await tick()
    _session?.join()
  },
  async createNewRoom() {
    const res = await fetch("/api/rooms", { method: "POST" })
    if (!res.ok) throw new Error("failed to create room")
    const data = (await res.json()) as { code: string; ownerToken?: string }
    const code = parseRoomCode(data.code)
    if (code && data.ownerToken) saveToken(code, data.ownerToken)
    location.href = `${location.origin}/?room=${data.code}`
  },
  joinRoom(code: string) {
    const parsed = parseRoomCode(code)
    if (!parsed) throw new Error("invalid room code")
    location.href = `${location.origin}/?room=${parsed}`
  },
  get roomCode() {
    return _code
  },
}
