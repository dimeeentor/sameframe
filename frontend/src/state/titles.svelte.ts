/** Title cache: /api/title fetch + in-flight dedup + fallback to the raw id.
 *  Reactive via SvelteMap, so components re-render when a title lands. */
import { SvelteMap } from "svelte/reactivity"

const titles = new SvelteMap<string, string>()
const inflight = new Map<string, Promise<void>>()

export function titleOf(id: string): string {
  return titles.get(id) ?? id
}

export function ensureTitle(id: string): void {
  if (titles.has(id) || inflight.has(id)) return
  const p = (async () => {
    try {
      const res = await fetch(`/api/title?id=${id}`)
      if (res.ok) {
        const j = (await res.json()) as { title: string }
        titles.set(id, j.title ?? id)
        return
      }
    } catch {}
    titles.set(id, id)
  })().finally(() => inflight.delete(id))
  inflight.set(id, p)
}
