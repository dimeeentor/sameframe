/** Room presence: live sockets per room, in memory only, never persisted.
 *  Dead sockets are pruned lazily on every read. */
import type { RoomCode } from "../shared/messages.ts"

const members = new Map<RoomCode, Set<WebSocket>>()

function liveSet(code: RoomCode): Set<WebSocket> | null {
  const set = members.get(code)
  if (!set) return null
  for (const ws of set) {
    if (ws.readyState !== WebSocket.OPEN) set.delete(ws)
  }
  if (set.size === 0) {
    members.delete(code)
    return null
  }
  return set
}

export function addClient(code: RoomCode, ws: WebSocket): void {
  let set = members.get(code)
  if (!set) {
    set = new Set()
    members.set(code, set)
  }
  set.add(ws)
}

export function removeClient(code: RoomCode, ws: WebSocket): void {
  const set = members.get(code)
  if (!set) return
  set.delete(ws)
  if (set.size === 0) members.delete(code)
}

export function clientCount(code: RoomCode): number {
  return liveSet(code)?.size ?? 0
}

export function broadcast(
  code: RoomCode,
  msg: unknown,
  exclude?: WebSocket,
): void {
  const set = liveSet(code)
  if (!set) return
  const data = JSON.stringify(msg)
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN && ws !== exclude) {
      ws.send(data)
    }
  }
}
