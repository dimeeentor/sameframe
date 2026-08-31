/** WS lifecycle + HTTP polling fallback, reduced to one ServerMsg stream.
 *  Nothing downstream can tell which transport produced a message. */
import type { ConnectionStatus } from "./domain.ts"
import { parseServerMsg, type ClientMsg, type ServerMsg } from "./wire.ts"

export type Transport = {
  start(): void
  stop(): void
  /** Fire-and-forget; if the WS is down the poll fallback reconciles. */
  send(msg: ClientMsg): void
  onMessage(cb: (m: ServerMsg) => void): void
  onStatus(cb: (s: ConnectionStatus) => void): void
}

const RECONNECT_MS = 1500
const POLL_MS = 2000

export function createTransport(): Transport {
  let ws: WebSocket | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let status: ConnectionStatus = "connecting"
  const msgSubs = new Set<(m: ServerMsg) => void>()
  const statusSubs = new Set<(s: ConnectionStatus) => void>()

  function isOpen(): boolean {
    return ws?.readyState === WebSocket.OPEN
  }

  function setStatus(next: ConnectionStatus) {
    if (status === next) return
    status = next
    statusSubs.forEach((cb) => cb(next))
  }

  function emit(raw: unknown) {
    const msg = parseServerMsg(raw)
    if (!msg) return
    msgSubs.forEach((cb) => cb(msg))
  }

  async function pollOnce() {
    try {
      const res = await fetch("/api/sync")
      if (res.ok) emit(await res.json())
    } catch {}
  }

  function startPolling() {
    if (pollTimer !== null) return
    setStatus("polling")
    pollOnce()
    pollTimer = setInterval(() => {
      if (!isOpen()) pollOnce()
    }, POLL_MS)
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function sendClient(msg: ClientMsg) {
    const sock = ws
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(msg))
      return
    }
    // Parity: nudge the server while polling (no server-side write path over
    // HTTP exists; the poll snapshot reconciles whatever was missed)
    if (msg.type === "load") fetch(`/api/sync?poll=1`).catch(() => {})
  }

  function connect() {
    if (stopped) return
    const proto = location.protocol === "https:" ? "wss:" : "ws:"
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws`)
    } catch {
      setStatus("offline")
      startPolling()
      retryTimer = setTimeout(connect, RECONNECT_MS)
      return
    }
    ws.onopen = () => {
      setStatus("open")
      stopPolling()
      sendClient({ type: "sync_request" })
    }
    // onerror is always followed by onclose; retry/polling happens there
    ws.onerror = () => {}
    ws.onclose = () => {
      setStatus("offline")
      startPolling()
      retryTimer = setTimeout(connect, RECONNECT_MS)
    }
    ws.onmessage = (e) => {
      try {
        emit(JSON.parse(e.data))
      } catch {}
    }
  }

  return {
    start() {
      stopped = false
      connect()
    },
    stop() {
      stopped = true
      stopPolling()
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
      ws = null
    },
    send: sendClient,
    onMessage(cb) {
      msgSubs.add(cb)
    },
    onStatus(cb) {
      statusSubs.add(cb)
    },
  }
}
