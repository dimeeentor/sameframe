<script lang="ts" module>
let activeDrag = false
</script>

<script lang="ts">
import { tick } from "svelte"
import { thumb, type VideoId } from "../app/domain"
import { titleOf } from "../state/titles.svelte"
import Icon from "./Icon.svelte"
import { collapse, rise } from "./motion"

type Props = {
  id: VideoId
  index: number
  active: boolean
  playing: boolean
  onplay: () => void
  onremove: () => void
  onreorder: (from: number, to: number) => void
}

let { id, index, active, playing, onplay, onremove, onreorder }: Props = $props()

let dragging = $state(false)
let row: HTMLLIElement | undefined = $state()

const SETTLE_MS = 200

function startDrag(e: PointerEvent) {
  if (activeDrag || e.button !== 0 || !row) return
  e.preventDefault()
  const li = row
  const list = li.parentElement
  if (!list) return
  const rows = Array.from(list.children) as HTMLElement[]
  const rects = rows.map((r) => r.getBoundingClientRect())
  const from = index
  const self = rects[from]
  const gap = rects.length > 1
    ? Math.max(0, rects[1].top - rects[0].bottom)
    : 0
  const shift = self.height + gap
  const mids = rects.map((r) => r.top + r.height / 2)

  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  activeDrag = true
  dragging = true
  list.classList.add("sorting")

  const startY = e.clientY
  let dy = 0
  let target = from

  const layout = () => {
    rows.forEach((r, i) => {
      if (i === from) return
      const off = from < i && i <= target
        ? -shift
        : target <= i && i < from
        ? shift
        : 0
      r.style.transform = off ? `translateY(${off}px)` : ""
    })
  }

  const move = (m: PointerEvent) => {
    dy = m.clientY - startY
    li.style.transform = `translateY(${dy}px) scale(1.02)`
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

    const land = target > from
      ? rects[target].bottom - self.bottom
      : target < from
      ? rects[target].top - self.top
      : 0
    li.style.transition = `transform ${SETTLE_MS}ms var(--ease-out)`
    li.style.transform = `translateY(${land}px)`
    await new Promise((r) => setTimeout(r, SETTLE_MS))

    if (target !== from) {
      onreorder(from, target)
      await tick()
    }
    for (const r of rows) {
      r.style.transition = "none"
      r.style.transform = ""
    }
    list.classList.remove("sorting")
    dragging = false
    activeDrag = false
    requestAnimationFrame(() => rows.forEach((r) => (r.style.transition = "")))
  }

  handle.addEventListener("pointermove", move)
  handle.addEventListener("pointerup", finish)
  handle.addEventListener("pointercancel", finish)
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<!-- click-to-play on the row is mouse convenience; the thumb button is the keyboard path -->
<li
  bind:this={row}
  class="qrow"
  class:active
  class:dragging
  in:rise={{ y: 10 }}
  out:collapse
  onclick={(e) => {
    if ((e.target as HTMLElement).closest(".qdel, .qhandle, .qthumb")) return
    onplay()
  }}
>
  <button
    class="qhandle"
    type="button"
    title="Drag to reorder"
    aria-label="Drag to reorder"
    onpointerdown={startDrag}
  >
    {#if playing}
      <span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>
    {:else}
      <span class="qnum">{String(index + 1).padStart(2, "0")}</span>
    {/if}
    <span class="qgrip"><Icon name="grip" /></span>
  </button>

  <button
    class="qthumb"
    type="button"
    title="Play"
    aria-label="Play {titleOf(id)}"
    onclick={(e) => {
      e.stopPropagation()
      onplay()
    }}
  >
    <img src={thumb(id)} loading="lazy" alt="" />
  </button>

  <div class="qtitle">
    {#if active}<span class="qnow">Now showing</span>{/if}
    <span class="qtext">{titleOf(id)}</span>
  </div>

  <button
    class="qdel"
    type="button"
    title="Remove from queue"
    aria-label="Remove from queue"
    onclick={(e) => {
      e.stopPropagation()
      onremove()
    }}
  >
    <Icon name="close" stroke={2.2} />
  </button>
</li>
