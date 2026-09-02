/// <reference lib="deno.unstable" />
/** Room persistence via Deno KV. Code is the sole identity, a 6-char uppercase
 *  alphanum. Every room row has a 24h TTL refreshed on each mutation. */
import { getKv, kvKeys, ROOM_TTL_MS } from "./kv.ts"
import type { RoomCode, RoomMetadata } from "../shared/messages.ts"
import { emptyRoomState, type RoomState } from "./room-state.ts"
import { clientCount } from "./presence.ts"

function isRoomState(v: unknown): v is RoomState {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.code === "string" && typeof o.createdAt === "number" &&
    Array.isArray(o.queue)
}

// --- code generation ---

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

function generateRoomCode(): RoomCode {
  let s = ""
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return s as RoomCode
}

// --- KV access ---

/** Ensure room exists, creating empty state if missing. */
export async function ensureRoom(code: RoomCode): Promise<RoomState> {
  const kv = await getKv()
  const key = kvKeys.roomState(code)
  const existing = await kv.get<RoomState>(key)
  if (existing.value && isRoomState(existing.value)) return existing.value

  const state = emptyRoomState(code)
  // best-effort create. If a race happens, the other writer wins and we return theirs
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

/** Create a new room with unique code. Retries on collision. */
export async function createRoom(): Promise<RoomMetadata> {
  const kv = await getKv()
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode()
    const key = kvKeys.roomState(code)
    const existing = await kv.get(key)
    if (existing.value !== null) continue // collision, retry

    const state = emptyRoomState(code)
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

export async function listRooms(): Promise<
  Array<RoomState & { clientCount: number }>
> {
  const kv = await getKv()
  const out: Array<RoomState & { clientCount: number }> = []
  for await (const entry of kv.list<RoomState>({ prefix: ["rooms"] })) {
    if (!isRoomState(entry.value)) continue
    // key is ["rooms", code, "state"], so filter only state rows
    if (entry.key.length !== 3 || entry.key[2] !== "state") continue
    out.push({ ...entry.value, clientCount: clientCount(entry.value.code) })
  }
  return out
}

/**
 * Atomic read-modify-write with versionstamp check and retry.
 * Refreshes TTL on success. A mutator returning null (or the same state
 * object) is a no-op: nothing written, `{ ok: false, reason: "noop" }`.
 * Callers must not broadcast from a no-op.
 */
export async function mutateRoom(
  code: RoomCode,
  mutator: (s: RoomState) => RoomState | null,
): Promise<
  { ok: true; state: RoomState } | {
    ok: false
    reason: "not_found" | "conflict" | "noop"
  }
> {
  const kv = await getKv()
  const key = kvKeys.roomState(code)

  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = await kv.get<RoomState>(key)
    if (!entry.value || !isRoomState(entry.value)) {
      return { ok: false, reason: "not_found" }
    }
    const next = mutator(entry.value)
    if (next === null || next === entry.value) {
      return { ok: false, reason: "noop" }
    }
    const res = await kv.atomic()
      .check(entry)
      .set(key, next, { expireIn: ROOM_TTL_MS })
      .commit()
    if (res.ok) return { ok: true, state: next }
    // versionstamp conflict, retry
  }
  return { ok: false, reason: "conflict" }
}
