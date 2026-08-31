/** Wire types — re-exported from the shared protocol module (../../../shared/)
 *  so the API and the frontend cannot drift. Imported only by session.ts and
 *  transport.ts. Never re-exported to the UI. */
export type { ClientMsg, ServerMsg, VideoId } from "../../../shared/messages.ts"
export { parseServerMsg } from "../../../shared/messages.ts"
