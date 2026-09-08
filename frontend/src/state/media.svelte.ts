/** Viewport shape, as reactive state. The compact layout collapses the header
 *  actions into a single menu, so it has to drive markup, not just CSS. */

const COMPACT = "(max-width: 720px)"

const mq = matchMedia(COMPACT)

export const layout = $state({ compact: mq.matches })

mq.addEventListener("change", (e) => (layout.compact = e.matches))
