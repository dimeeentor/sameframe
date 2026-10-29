<script lang="ts">
import { tick, type Snippet } from "svelte"

type Props = { open: boolean; onclose: () => void; label: string; children: Snippet }
let { open, onclose, label, children }: Props = $props()

let dialog: HTMLDialogElement | undefined = $state()
let panel: HTMLDivElement | undefined = $state()
let shown = $state(false)
let scrim: HTMLDivElement | undefined

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
  if (!dialog) return
  if (open) {
    if (!dialog.open) dialog.showModal()
    dialog.getBoundingClientRect()
    shown = true
    tick().then(() => {
      if (open) panel?.focus({ preventScroll: true })
    })
    return
  }
  shown = false
  if (!dialog.open) return
  const timer = setTimeout(() => dialog?.close(), 260)
  return () => clearTimeout(timer)
})

function oncancel(e: Event) {
  e.preventDefault()
  onclose()
}

function onnativeclose() {
  if (open) onclose()
}
</script>

<dialog
  class={["sheet-root", { open: shown }]}
  bind:this={dialog}
  aria-label={label}
  {oncancel}
  onclose={onnativeclose}
>
  <div class="sheet-scrim" bind:this={scrim} onclick={onclose} aria-hidden="true"></div>
  <div class="sheet" bind:this={panel} tabindex="-1">
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
</dialog>

<style>
  .sheet-root {
    width: auto;
    height: auto;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    overflow: visible;
    border: 0;
    color: inherit;
    background: transparent;
  }

  .sheet-root::backdrop {
    background: transparent;
  }
</style>
