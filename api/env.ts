import type { RoomDurableObject } from "./room-durable-object.ts"

export type Env = {
  ROOMS: DurableObjectNamespace<RoomDurableObject>
  ASSETS: Fetcher
}
