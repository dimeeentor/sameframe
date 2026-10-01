<script lang="ts">
import type { Snippet } from "svelte"

type Props = { open: boolean; onclose: () => void; label: string; children: Snippet }
let { open, onclose, label, children }: Props = $props()

let panel: HTMLDivElement | undefined = $state()
let scrim: HTMLDivElement | undefined = $state()

let dragging = false
let startY = 0
let startT = 0
let dy = 0
let height = 0

function onpointerdown(e: PointerEvent) {
  if (dragging || !panel || e.button !== 0) return
  dragging = true
  startY = e.clientY
  startT = performance.now()
  dy = 0
  height = panel.offsetHeight
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  panel.style.transition = "none"
  if (scrim) scrim.style.transition = "none"
}

function onpointermove(e: PointerEvent) {
  if (!dragging || !panel) return
  const raw = e.clientY - startY
  dy = raw < 0 ? -Math.pow(-raw, 0.62) : raw
  panel.style.transform = `translateY(${dy}px)`
  if (scrim) scrim.style.opacity = String(1 - Math.max(0, dy) / height)
}

function onpointerup() {
  if (!dragging || !panel) return
  dragging = false
  const velocity = Math.abs(dy) / (performance.now() - startT)
  const dismiss = dy > height * 0.3 || (dy > 12 && velocity > 0.11)
  panel.style.transition = ""
  panel.style.transform = ""
  if (scrim) {
    scrim.style.transition = ""
    scrim.style.opacity = ""
  }
  if (dismiss) onclose()
}

$effect(() => {
  if (!open) return
  const root = document.documentElement
  root.classList.add("scroll-locked")
  panel?.focus({ preventScroll: true })
  return () => root.classList.remove("scroll-locked")
})
</script>

<svelte:window onkeydown={(e) => open && e.key === "Escape" && onclose()} />

<div class="sheet-root" class:open inert={!open}>
  <div class="sheet-scrim" bind:this={scrim} onclick={onclose} aria-hidden="true"></div>
  <div
    class="sheet"
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
  >
    <div
      class="sheet-grab"
      role="presentation"
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      onpointercancel={onpointerup}
    >
      <span class="sheet-handle"></span>
    </div>
    <div class="sheet-body">
      {@render children()}
    </div>
  </div>
</div>
