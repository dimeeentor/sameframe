<script lang="ts">
  import { thumb, type VideoId } from "../app/domain"
  import { titleOf } from "../state/titles.svelte"

  type Props = {
    id: VideoId
    index: number
    active: boolean
    onplay: () => void
    onremove: () => void
    onreorder: (from: number, to: number) => void
  }

  let { id, index, active, onplay, onremove, onreorder }: Props = $props()

  let dragging = $state(false)

  function startDrag(e: PointerEvent) {
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    const li = handle.closest("li")
    const list = li?.closest("ul")
    if (!li || !list) return
    let targetIndex = index
    dragging = true
    handle.setPointerCapture(e.pointerId)

    const update = (move: PointerEvent) => {
      const row = document
        .elementFromPoint(move.clientX, move.clientY)
        ?.closest("li")
      const rows = Array.from(list.children)
      const nextIndex = rows.indexOf(row as Element)
      if (nextIndex >= 0) {
        targetIndex = nextIndex
        rows.forEach((item, i) =>
          item.classList.toggle("drag-over", i === targetIndex && i !== index),
        )
      }
    }
    const finish = () => {
      dragging = false
      Array.from(list.children).forEach((item) =>
        item.classList.remove("drag-over"),
      )
      if (targetIndex !== index) onreorder(index, targetIndex)
      handle.removeEventListener("pointermove", update)
      handle.removeEventListener("pointerup", finish)
      handle.removeEventListener("pointercancel", finish)
    }
    handle.addEventListener("pointermove", update)
    handle.addEventListener("pointerup", finish)
    handle.addEventListener("pointercancel", finish)
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<li
  class:active
  class:dragging
  onclick={(e) => {
    if ((e.target as HTMLElement).closest(".qdel, .drag-handle")) return
    onplay()
  }}
>
  <button
    class="drag-handle"
    type="button"
    title="Drag to reorder"
    aria-label="Drag to reorder"
    onpointerdown={startDrag}
  >
    ⠿
  </button>
  <img class="qthumb" src={thumb(id)} loading="lazy" alt="" />
  <div class="qtitle">{titleOf(id)}</div>
  <button
    class="qdel"
    title="remove"
    onclick={(e) => {
      e.stopPropagation()
      onremove()
    }}
  >
    Remove
  </button>
</li>
