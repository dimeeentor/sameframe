<script lang="ts">
import { view } from "../state/session.svelte"
import Icon from "./Icon.svelte"

let { block = false }: { block?: boolean } = $props()

let copied = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function share() {
  try {
    await navigator.clipboard.writeText(view.shareUrl)
    copied = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (copied = false), 1600)
  } catch {
    prompt("Copy link:", view.shareUrl)
  }
}
</script>

<button
  class="btn primary invite"
  class:block
  class:copied
  type="button"
  title="Copy invite link"
  onclick={share}
>
  <span class="swap-cell">
    <span class="swap-label" aria-hidden={copied}>
      <Icon name="link" />
      {block ? "Copy invite link" : "Invite"}
    </span>
    <span class="swap-label" aria-hidden={!copied}>
      <Icon name="check" stroke={2.4} />
      Link copied
    </span>
  </span>
</button>
<span class="sr-only" aria-live="polite">{copied ? "Invite link copied" : ""}</span>
