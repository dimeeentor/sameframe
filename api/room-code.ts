/** Room code generation. Moved out of the old KV-backed rooms.ts — the code
 *  itself is still needed by api.ts to pick a name before creating a room's
 *  Durable Object. */
import type { RoomCode } from "../shared/messages.ts"

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
