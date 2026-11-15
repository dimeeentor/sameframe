import { children } from "solid-js"
import type { JSX } from "@solidjs/web"
import { createListTransition, createSwitchTransition } from "@solid-primitives/transition-group"

type Anim = (el: HTMLElement) => Animation
const run = (anim: Anim | undefined, el: HTMLElement, done: () => void) => {
  const a = anim?.(el)
  if (a) a.finished.then(done, done)
  else done()
}

/** One child that animates in and out; the leaving one stays in the DOM until its exit ends. */
export function Transition(props: { children: JSX.Element; enter?: Anim; exit?: Anim }) {
  const el = children(() => props.children)
  return createSwitchTransition(() => el() as HTMLElement | undefined, {
    mode: "parallel",
    onEnter: (el, done) => run(props.enter, el, done),
    onExit: (el, done) => run(props.exit, el, done),
  }) as unknown as JSX.Element
}

/** Same for a list: added rows run `enter`, removed rows stay in place until `exit` ends. */
export function TransitionGroup(props: { children: JSX.Element; enter: Anim; exit: Anim }) {
  const els = children(() => props.children)
  return createListTransition(() => els.toArray() as HTMLElement[], {
    exitMethod: "keep-index",
    onChange({ added, removed, finishRemoved }) {
      for (const el of added) props.enter(el)
      for (const el of removed) run(props.exit, el, () => finishRemoved([el]))
    },
  }) as unknown as JSX.Element
}
