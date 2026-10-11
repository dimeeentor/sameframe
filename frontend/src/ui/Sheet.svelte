<script lang="ts">
import type { Snippet } from "svelte"

type Props = { open: boolean; onclose: () => void; label: string; children: Snippet }
let { open, onclose, label, children }: Props = $props()

let panel: HTMLDivElement | undefined = $state()

$effect(() => {
  if (!open) return
  panel?.focus({ preventScroll: true })
})
</script>

<svelte:window onkeydown={(e) => open && e.key === "Escape" && onclose()} />

<div class="sheet-root" class:open inert={!open}>
  <div class="sheet-scrim" onclick={onclose} aria-hidden="true"></div>
  <div
    class="sheet"
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
  >
    <div class="sheet-body">
      {@render children()}
    </div>
  </div>
</div>
