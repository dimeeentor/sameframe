/// <reference lib="deno.unstable" />
/** Room persistence via Deno KV. Code is the sole identity — 6-char uppercase alphanum.
 *  Every room row has 24h TTL refreshed on each mutation. */

import { getKv, kvKeys, ROOM_TTL_MS } from "./kv.ts"
import type { RoomCode, RoomMetadata, VideoId } from "../shared/messages.ts"
import { ROOM_CODE_RE } from "../shared/messages.ts"

export type { RoomCode, RoomMetadata }

export type RoomState = {
  code: RoomCode
  createdAt: number
  videoId: VideoId | null
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  updatedAt: number
  queue: VideoId[]
  queueIndex: number
}

// in-memory client registry — ephemeral, not in KV
const roomClients = new Map<string, Set<WebSocket>>()

export function addClientToRoom(code: RoomCode, ws: WebSocket): void {
  let set = roomClients.get(code)
  if (!set) {
    set = new Set()
    roomClients.set(code, set)
  }
  set.add(ws)
}

export function removeClientFromRoom(code: RoomCode, ws: WebSocket): void {
  const set = roomClients.get(code)
  if (!set) return
  set.delete(ws)
  if (set.size === 0) roomClients.delete(code)
}

export function getRoomClientCount(code: RoomCode): number {
  return roomClients.get(code)?.size ?? 0
}

export function broadcastToRoom(code: RoomCode, msg: unknown, exclude?: WebSocket): void {
  const set = roomClients.get(code)
  if (!set) return
  const data = JSON.stringify(msg)
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN && ws !== exclude) {
      ws.send(data)
    }
  }
}

// --- code generation ---

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

export function generateRoomCode(): RoomCode {
  let s = ""
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return s as RoomCode
}

export function isValidCode(v: string): v is RoomCode {
  return ROOM_CODE_RE.test(v)
}

// --- KV helpers ---

function emptyState(code: RoomCode): RoomState {
  const now = Date.now()
  return {
    code,
    createdAt: now,
    videoId: null,
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
    updatedAt: now,
    queue: [],
    queueIndex: -1,
  }
}

function isRoomState(v: unknown): v is RoomState {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.code === "string" && typeof o.createdAt === "number" && Array.isArray(o.queue)
}

/** Ensure room exists — creates empty state if missing. Returns state. */
export async function ensureRoom(code: RoomCode): Promise<RoomState> {
  const kv = await getKv()
  const key = kvKeys.roomState(code)
  const existing = await kv.get<RoomState>(key)
  if (existing.value && isRoomState(existing.value)) return existing.value

  const state = emptyState(code)
  // best-effort create — if race, the other writer wins and we return theirs
  const res = await kv.atomic()
    .check(existing)
    .set(key, state, { expireIn: ROOM_TTL_MS })
    .commit()
  if (res.ok) return state
  // lost race, re-read
  const retry = await kv.get<RoomState>(key)
  if (retry.value && isRoomState(retry.value)) return retry.value
  return state
}

export async function getRoomState(code: RoomCode): Promise<RoomState | null> {
  const kv = await getKv()
  const res = await kv.get<RoomState>(kvKeys.roomState(code))
  if (!res.value || !isRoomState(res.value)) return null
  return res.value
}

export async function roomExists(code: string): Promise<boolean> {
  if (!isValidCode(code)) return false
  const kv = await getKv()
  const res = await kv.get(kvKeys.roomState(code as RoomCode))
  return res.value !== null
}

/** Create a new room with unique code. Retries on collision. */
export async function createRoom(): Promise<RoomMetadata> {
  const kv = await getKv()
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode()
    const key = kvKeys.roomState(code)
    const existing = await kv.get(key)
    if (existing.value !== null) continue // collision, retry

    const state = emptyState(code)
    const res = await kv.atomic()
      .check(existing)
      .set(key, state, { expireIn: ROOM_TTL_MS })
      .commit()
    if (res.ok) {
      return { code, createdAt: state.createdAt }
    }
  }
  throw new Error("failed to generate unique room code")
}

export async function listRooms(): Promise<Array<RoomState & { clientCount: number }>> {
  const kv = await getKv()
  const out: Array<RoomState & { clientCount: number }> = []
  for await (const entry of kv.list<RoomState>({ prefix: ["rooms"] })) {
    if (!isRoomState(entry.value)) continue
    // key is ["rooms", code, "state"] — filter only state rows
    if (entry.key.length !== 3 || entry.key[2] !== "state") continue
    out.push({ ...entry.value, clientCount: getRoomClientCount(entry.value.code) })
  }
  return out
}

/**
 * Atomic read-modify-write with versionstamp check and retry.
 * Refreshes TTL on success. Returns updated state or null on not_found.
 */
export async function mutateRoom(
  code: RoomCode,
  mutator: (s: RoomState) => RoomState | null,
): Promise<{ ok: true; state: RoomState } | { ok: false; reason: "not_found" | "conflict" }> {
  const kv = await getKv()
  const key = kvKeys.roomState(code)

  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = await kv.get<RoomState>(key)
    if (!entry.value || !isRoomState(entry.value)) {
      return { ok: false, reason: "not_found" }
    }
    const next = mutator(entry.value)
    if (next === null) {
      // no-op, treat as success with current state
      return { ok: true, state: entry.value }
    }
    const res = await kv.atomic()
      .check(entry)
      .set(key, next, { expireIn: ROOM_TTL_MS })
      .commit()
    if (res.ok) return { ok: true, state: next }
    // versionstamp conflict — retry
  }
  return { ok: false, reason: "conflict" }
}
