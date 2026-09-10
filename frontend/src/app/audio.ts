let ctx: AudioContext | null = null

type AudioContextCtor = new () => AudioContext

export function unlockAudio(): void {
  const Ctor: AudioContextCtor | undefined = globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!Ctor) return
  try {
    ctx ??= new Ctor()
    if (ctx.state === "suspended") void ctx.resume()
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, 22050)
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    return
  }
}
