<script lang="ts">
import Icon from "./Icon.svelte"

let {
  text,
  label,
  done,
  title,
  variant = "primary",
  block = false,
}: {
  text: () => string | null
  label: string
  done: string
  title: string
  variant?: "primary" | "subtle"
  block?: boolean
} = $props()

let copied = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  const value = text()
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copied = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (copied = false), 1600)
  } catch {
    prompt(`${title}:`, value)
  }
}
</script>

<button class="btn {variant}" class:block class:copied type="button" {title} onclick={copy}>
  <span class="swap-cell">
    <span class="swap-label" aria-hidden={copied}>
      <Icon name="link" />
      {label}
    </span>
    <span class="swap-label" aria-hidden={!copied}>
      <Icon name="check" stroke={2.4} />
      {done}
    </span>
  </span>
</button>
<span class="sr-only" aria-live="polite">{copied ? done : ""}</span>
