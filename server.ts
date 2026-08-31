/** Root shim for Deno Deploy — delegates to api/server.ts.
 *  Deploy dashboard may be set to `server.ts`, `api/server.ts`, or `src/server.ts`.
 *  Keeping all three shims ensures any setting resolves. */
import "./api/server.ts"
