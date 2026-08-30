export type SyncState = {
  videoId: string | null
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  updatedAt: number
  queue: string[]
  queueIndex: number
}

export const state: SyncState = {
  videoId: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  updatedAt: Date.now(),
  queue: [],
  queueIndex: -1,
}

export let publicUrl: string | null = null

export const clients = new Set<WebSocket>()

export function estimatedTime(): number {
  if (!state.isPlaying || state.videoId === null) return state.currentTime
  const elapsed = ((Date.now() - state.updatedAt) / 1000) * state.playbackRate
  return state.currentTime + elapsed
}

export function getSyncPayload() {
  return {
    type: "sync",
    videoId: state.videoId,
    currentTime: estimatedTime(),
    isPlaying: state.isPlaying,
    playbackRate: state.playbackRate,
    updatedAt: Date.now(),
    queue: state.queue,
    queueIndex: state.queueIndex,
    publicUrl,
  }
}

export function broadcast(msg: unknown, exclude?: WebSocket) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN && ws !== exclude) {
      ws.send(data)
    }
  }
}

export function setPublicUrl(url: string) {
  publicUrl = url.replace(/\/$/, "")
  console.log(
    `\n✨ PUBLIC URL: ${publicUrl}  → share with anyone!\n   (Share button will now copy this)\n`,
  )

  broadcast({ type: "public_url", url: publicUrl })
}

export function setVideo(videoId: string, broadcastToAll = true) {
  let idx = state.queue.indexOf(videoId)
  if (idx === -1) {
    state.queue.push(videoId)
    idx = state.queue.length - 1
  }
  state.queueIndex = idx
  state.videoId = videoId
  state.currentTime = 0
  state.isPlaying = true
  state.updatedAt = Date.now()
  if (broadcastToAll) {
    broadcast({
      type: "load",
      videoId,
      currentTime: 0,
      isPlaying: true,
      queue: state.queue,
      queueIndex: state.queueIndex,
    })
  }
}
