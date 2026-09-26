import type { TransitionConfig } from "svelte/transition"
import { cubicInOut, quintOut } from "svelte/easing"

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")
export const reducedMotion = () => reducedQuery.matches

const fadeOnly = (duration: number, delay = 0): TransitionConfig => ({
  duration,
  delay,
  css: (t) => `opacity: ${t}`,
})

export function rise(
  _node: Element,
  { y = 8, blur = 4, duration = 280, delay = 0 } = {},
): TransitionConfig {
  if (reducedMotion()) return fadeOnly(160, delay)
  return {
    duration,
    delay,
    easing: quintOut,
    css: (t, u) =>
      `opacity: ${t}; transform: translateY(${u * y}px); filter: blur(${u * blur}px)`,
  }
}

export function swap(_node: Element, { duration = 200 } = {}): TransitionConfig {
  if (reducedMotion()) return fadeOnly(120)
  return {
    duration,
    easing: quintOut,
    css: (t, u) => `opacity: ${t}; filter: blur(${u * 3}px)`,
  }
}

export function collapse(node: HTMLElement, { duration = 240 } = {}): TransitionConfig {
  if (reducedMotion()) return fadeOnly(120)
  const style = getComputedStyle(node)
  const h = node.offsetHeight
  const pt = parseFloat(style.paddingTop)
  const pb = parseFloat(style.paddingBottom)
  return {
    duration,
    easing: cubicInOut,
    css: (t) => {
      const o = Math.max(0, (t - 0.4) / 0.6)
      return `overflow: hidden; opacity: ${o}; height: ${t * h}px;` +
        `padding-top: ${t * pt}px; padding-bottom: ${t * pb}px;` +
        `transform: scale(${0.97 + 0.03 * t})`
    },
  }
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
