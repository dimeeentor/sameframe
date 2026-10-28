/** Viewport shape, as reactive state. The compact layout collapses the header
 *  actions into a single menu, so it has to drive markup, not just CSS. */
import { MediaQuery } from "svelte/reactivity"

const COMPACT = new MediaQuery("max-width: 720px")

export const layout = {
  get compact() {
    return COMPACT.current
  },
}
