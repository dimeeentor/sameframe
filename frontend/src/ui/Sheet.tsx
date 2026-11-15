import { createEffect, createSignal } from "solid-js"
import type { JSX } from "@solidjs/web"

type Props = { open: boolean; onclose: () => void; label: string; children: JSX.Element; anchor?: HTMLElement }

export default function Sheet(props: Props) {
  let dialog!: HTMLDialogElement
  let panel!: HTMLDivElement
  let scrim!: HTMLDivElement
  const [shown, setShown] = createSignal(false)

  let dragging = false
  let startY = 0
  let startT = 0
  let dy = 0
  let height = 0

  function onPointerDown(e: PointerEvent) {
    if (dragging || e.button !== 0) return
    dragging = true
    startY = e.clientY
    startT = performance.now()
    dy = 0
    height = panel.offsetHeight
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    panel.style.transition = "none"
    scrim.style.transition = "none"
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    const raw = e.clientY - startY
    dy = raw < 0 ? -Math.pow(-raw, 0.62) : raw
    panel.style.transform = `translateY(${dy}px)`
    scrim.style.opacity = String(1 - Math.max(0, dy) / height)
  }

  function onPointerUp() {
    if (!dragging) return
    dragging = false
    const velocity = Math.abs(dy) / (performance.now() - startT)
    const dismiss = dy > height * 0.3 || (dy > 12 && velocity > 0.11)
    panel.style.transition = ""
    panel.style.transform = ""
    scrim.style.transition = ""
    scrim.style.opacity = ""
    if (dismiss) props.onclose()
  }

  createEffect(
    () => ({ open: props.open, anchor: props.anchor }),
    ({ open, anchor }) => {
      if (open) {
        if (!dialog.open) dialog.showModal()
        if (anchor) {
          // desktop popover: hang from the trigger, on whichever side has room
          const r = anchor.getBoundingClientRect()
          const w = document.documentElement.clientWidth
          const left = r.left + r.width / 2 < w / 2
          panel.style.setProperty("--sheet-top", `${r.bottom + 8}px`)
          panel.style.setProperty("--sheet-left", left ? `${r.left}px` : "auto")
          panel.style.setProperty("--sheet-right", left ? "auto" : `${w - r.right}px`)
          panel.style.setProperty("--sheet-origin", left ? "top left" : "top right")
        }
        dialog.getBoundingClientRect()
        setShown(true)
        queueMicrotask(() => {
          if (props.open && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
        })
        return
      }
      setShown(false)
      if (!dialog.open) return
      const timer = setTimeout(() => dialog.close(), 260)
      return () => clearTimeout(timer)
    },
  )

  function onCancel(e: Event) {
    e.preventDefault()
    props.onclose()
  }

  function onNativeClose() {
    if (props.open) props.onclose()
  }

  return (
    <dialog
      class={["sheet-root", { open: shown(), anchored: !!props.anchor }]}
      ref={(el) => (dialog = el)}
      aria-label={props.label}
      onCancel={onCancel}
      onClose={onNativeClose}
    >
      <div class="sheet-scrim" ref={(el) => (scrim = el)} onClick={() => props.onclose()} aria-hidden="true"></div>
      <div class="sheet" ref={(el) => (panel = el)} tabindex="-1">
        <div
          class="sheet-grab"
          role="presentation"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span class="sheet-handle"></span>
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </dialog>
  )
}
