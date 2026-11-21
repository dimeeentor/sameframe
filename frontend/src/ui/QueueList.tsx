import { createMemo, createSignal, For, Show } from "solid-js"
import { session, view } from "../state/session"
import type { VideoId } from "../app/domain"
import QueueRow from "./QueueRow"
import { Transition, TransitionGroup } from "./Transition"
import { collapse, fade, rise } from "./motion"

export default function QueueList() {
  const [holding, setHolding] = createSignal(false)
  // the list fades out after a clear, so keep showing the rows it had
  const rows = createMemo<readonly VideoId[]>((prev) => (view.queue.length ? [...view.queue] : (prev ?? [])))

  const release = () => setHolding(false)

  function onFillEnd(e: TransitionEvent) {
    if (!holding() || e.propertyName !== "clip-path") return
    setHolding(false)
    session.clearQueue()
  }

  return (
    <section class="queue" aria-labelledby="queue-heading">
      <div class="queue-head">
        <h2 id="queue-heading">Up next</h2>
        <Show when={view.queue.length}>
          <button
            class={["hold-btn", { holding: holding() }]}
            type="button"
            title="Press and hold to clear the queue"
            onPointerDown={(e) => e.button === 0 && setHolding(true)}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault()
                setHolding(true)
              }
            }}
            onKeyUp={release}
            onBlur={release}
          >
            <span class="hold-label">Hold to clear</span>
            <span class="hold-fill" aria-hidden="true" onTransitionEnd={onFillEnd}>
              Hold to clear
            </span>
          </button>
        </Show>
      </div>

      {/* list and empty state share one grid cell, so clearing crossfades
          on opacity/transform alone instead of collapsing every row */}
      <div class="queue-body">
        <Transition enter={(el) => rise(el, { y: 8, blur: 0, delay: 60 })}>
          <Show when={view.queue.length === 0}>
            <div class="empty">
              <div class="empty-reel" aria-hidden="true">
                <i></i>
                <i></i>
                <i></i>
              </div>
              <p>The reel is empty.</p>
              <span>Queue a link and it lines up here, playing in order.</span>
            </div>
          </Show>
        </Transition>
        <Transition exit={(el) => fade(el, { duration: 150, out: true })}>
          <Show when={view.queue.length > 0}>
            <ol class="queue-list">
              <TransitionGroup enter={(el) => rise(el, { y: 10 })} exit={collapse}>
                <For each={rows()}>
                  {(id, i) => (
                    <QueueRow
                      id={id}
                      index={i()}
                      active={i() === view.queueIndex}
                      playing={i() === view.queueIndex && view.isPlaying}
                      onplay={() => session.loadVideo(id)}
                      onremove={() => session.removeFromQueue(i())}
                      onreorder={(from, to) => session.reorderQueue(from, to)}
                    />
                  )}
                </For>
              </TransitionGroup>
            </ol>
          </Show>
        </Transition>
      </div>
    </section>
  )
}
