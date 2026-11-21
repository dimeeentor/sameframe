import { createEffect } from "solid-js"

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")
const reducedMotion = () => reducedQuery.matches

const QUINT_OUT = "cubic-bezier(0.22, 1, 0.36, 1)"
const CUBIC_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)"

type Timing = { duration: number; delay?: number; easing?: string; out?: boolean }
type Opts = { duration?: number; delay?: number; out?: boolean }

/** Frames run from hidden to shown; `out` plays them backwards, eased the same way. */
function play(el: Element, frames: Keyframe[], { duration, delay = 0, easing = "linear", out = false }: Timing) {
  if (out) frames = frames.reverse().map((f) => (f.offset == null ? f : { ...f, offset: 1 - f.offset }))
  return el.animate(frames, { duration, delay, easing, fill: out ? "forwards" : "backwards" })
}

export function fade(el: Element, { duration = 400, delay = 0, out = false }: Opts = {}) {
  return play(el, [{ opacity: 0 }, { opacity: 1 }], { duration, delay, out })
}

export function rise(el: Element, { y = 8, blur = 4, duration = 280, delay = 0, out = false } = {}) {
  if (reducedMotion()) return fade(el, { duration: 160, delay, out })
  return play(
    el,
    [
      { opacity: 0, transform: `translateY(${y}px)`, filter: `blur(${blur}px)` },
      { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" },
    ],
    { duration, delay, easing: QUINT_OUT, out },
  )
}

export function swap(el: Element, { duration = 200 } = {}) {
  if (reducedMotion()) return fade(el, { duration: 120 })
  return play(el, [{ opacity: 0, filter: "blur(3px)" }, { opacity: 1, filter: "blur(0px)" }], {
    duration,
    easing: QUINT_OUT,
  })
}

/** Exit only: folds the element's height away. */
export function collapse(el: HTMLElement, { duration = 240 } = {}) {
  if (reducedMotion()) return fade(el, { duration: 120, out: true })
  const style = getComputedStyle(el)
  const h = `${el.offsetHeight}px`
  el.style.overflow = "hidden"
  return play(
    el,
    [
      { opacity: 0, height: "0px", paddingTop: "0px", paddingBottom: "0px", transform: "scale(0.97)" },
      { opacity: 0, offset: 0.4 },
      { opacity: 1, height: h, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, transform: "scale(1)" },
    ],
    { duration, easing: CUBIC_IN_OUT, out: true },
  )
}

/** Ref factory: replays `anim` on the element each time `key` changes after mount,
 *  like an intro on a keyed block. Call it in `ref={...}`, not inside a ref callback. */
export function replayOn(key: () => unknown, anim: (el: Element) => Animation) {
  let el: Element | undefined
  createEffect(key, () => void (el && anim(el)), { defer: true })
  return (e: Element) => void (el = e)
}

export function shake(el: Element | undefined) {
  if (!el || reducedMotion()) return
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  )
}
