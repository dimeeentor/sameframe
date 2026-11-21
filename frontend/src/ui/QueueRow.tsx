import { createSignal, flush, Show } from "solid-js"
import { thumb, type VideoId } from "../app/domain"
import { titleOf } from "../state/titles"
import Icon from "./Icon"

let activeDrag = false

const SETTLE_MS = 200

type Props = {
  id: VideoId
  index: number
  active: boolean
  playing: boolean
  onplay: () => void
  onremove: () => void
  onreorder: (from: number, to: number) => void
}

export default function QueueRow(props: Props) {
  const [dragging, setDragging] = createSignal(false)
  let row!: HTMLLIElement

  function startDrag(e: PointerEvent) {
    if (activeDrag || e.button !== 0) return
    e.preventDefault()
    const list = row.parentElement
    if (!list) return
    const rows = Array.from(list.children) as HTMLElement[]
    const rects = rows.map((r) => r.getBoundingClientRect())
    const from = props.index
    const self = rects[from]
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0
    const shift = self.height + gap
    const mids = rects.map((r) => r.top + r.height / 2)

    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    activeDrag = true
    setDragging(true)
    list.classList.add("sorting")

    const startY = e.clientY
    let dy = 0
    let target = from

    const layout = () => {
      rows.forEach((r, i) => {
        if (i === from) return
        const off = from < i && i <= target ? -shift : target <= i && i < from ? shift : 0
        r.style.transform = off ? `translateY(${off}px)` : ""
      })
    }

    const move = (m: PointerEvent) => {
      dy = m.clientY - startY
      row.style.transform = `translateY(${dy}px) scale(1.02)`
      const center = mids[from] + dy
      let t = from
      for (let i = from + 1; i < rows.length; i++) if (center > mids[i]) t = i
      for (let i = from - 1; i >= 0; i--) if (center < mids[i]) t = i
      if (t !== target) {
        target = t
        layout()
      }
    }

    const finish = async () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", finish)
      handle.removeEventListener("pointercancel", finish)

      const land =
        target > from ? rects[target].bottom - self.bottom : target < from ? rects[target].top - self.top : 0
      row.style.transition = `transform ${SETTLE_MS}ms var(--ease-out)`
      row.style.transform = `translateY(${land}px)`
      await new Promise((r) => setTimeout(r, SETTLE_MS))

      if (target !== from) {
        props.onreorder(from, target)
        flush() // reorder the DOM before clearing the transforms, or rows jump back
      }
      for (const r of rows) {
        r.style.transition = "none"
        r.style.transform = ""
      }
      list.classList.remove("sorting")
      setDragging(false)
      activeDrag = false
      requestAnimationFrame(() => rows.forEach((r) => (r.style.transition = "")))
    }

    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", finish)
    handle.addEventListener("pointercancel", finish)
  }

  // click-to-play on the row is mouse convenience; the thumb button is the keyboard path
  return (
    <li
      ref={(el) => (row = el)}
      class={["qrow", { active: props.active, dragging: dragging() }]}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".qdel, .qhandle, .qthumb")) return
        props.onplay()
      }}
    >
      <button class="qhandle" type="button" title="Drag to reorder" aria-label="Drag to reorder" onPointerDown={startDrag}>
        <Show when={props.playing} fallback={<span class="qnum">{String(props.index + 1).padStart(2, "0")}</span>}>
          <span class="bars" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </span>
        </Show>
        <span class="qgrip">
          <Icon name="grip" />
        </span>
      </button>

      <button
        class="qthumb"
        type="button"
        title="Play"
        aria-label={`Play ${titleOf(props.id)}`}
        onClick={(e) => {
          e.stopPropagation()
          props.onplay()
        }}
      >
        <img src={thumb(props.id)} loading="lazy" alt="" />
      </button>

      <div class="qtitle">
        <span class="qtext">{titleOf(props.id)}</span>
      </div>

      <button
        class="qdel"
        type="button"
        title="Remove from queue"
        aria-label="Remove from queue"
        onClick={(e) => {
          e.stopPropagation()
          props.onremove()
        }}
      >
        <Icon name="close" stroke={2.2} />
      </button>
    </li>
  )
}
