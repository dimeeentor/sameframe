/// <reference lib="deno.unstable" />
/** Singleton Deno KV access. The only place that calls Deno.openKv. */

let kvInstance: Deno.Kv | null = null

export async function getKv(): Promise<Deno.Kv> {
  if (kvInstance) return kvInstance
  // requires --unstable-kv
  kvInstance = await Deno.openKv()
  return kvInstance
}

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000 // 24h

export const kvKeys = {
  roomState: (code: string) => ["rooms", code, "state"] as const,
  roomByCode: (code: string) => ["rooms_by_code", code] as const,
}
