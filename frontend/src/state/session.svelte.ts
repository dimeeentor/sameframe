/** The whole reactive boundary between the plain-TS session core and Svelte:
 *  session snapshots become runes; components read `view`, call `session`. */
import { createSession } from "../app/session.ts"
import { createTransport } from "../app/transport.ts"
import { createPlayer } from "../app/player.ts"
import type { SyncSnapshot } from "../app/domain.ts"

const session = createSession(createTransport(), createPlayer())

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
})

session.subscribe((snap) => Object.assign(view, snap))

export { session }
