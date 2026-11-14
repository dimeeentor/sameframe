/** Viewport shape, as reactive state. The compact layout collapses the header
 *  actions into a single menu, so it has to drive markup, not just CSS. */
import { createSignal } from "solid-js"

export function mediaQuery(query: string) {
  const mql = matchMedia(query)
  const [matches, setMatches] = createSignal(mql.matches)
  mql.addEventListener("change", (e) => setMatches(e.matches))
  return matches
}

const compact = mediaQuery("(max-width: 720px)")

export const layout = {
  get compact() {
    return compact()
  },
}
