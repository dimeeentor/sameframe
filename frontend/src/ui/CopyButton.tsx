import { createSignal } from "solid-js"
import Icon from "./Icon"

export default function CopyButton(props: {
  text: () => string | null
  label: string
  done: string
  title: string
  variant?: "primary" | "subtle"
  block?: boolean
}) {
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    const value = props.text()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setCopied(false), 1600)
    } catch {
      prompt(`${props.title}:`, value)
    }
  }

  return (
    <>
      <button
        class={["btn", props.variant ?? "primary", { block: props.block, copied: copied() }]}
        type="button"
        title={props.title}
        onClick={copy}
      >
        <span class="swap-cell">
          <span class="swap-label" aria-hidden={`${copied()}`}>
            <Icon name="link" />
            {props.label}
          </span>
          <span class="swap-label" aria-hidden={`${!copied()}`}>
            <Icon name="check" stroke={2.4} />
            {props.done}
          </span>
        </span>
      </button>
      <span class="sr-only" aria-live="polite">
        {copied() ? props.done : ""}
      </span>
    </>
  )
}
