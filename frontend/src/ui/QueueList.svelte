<script lang="ts">
import { session, view } from "../state/session.svelte"
import QueueRow from "./QueueRow.svelte"
import { fade } from "svelte/transition"
import { rise } from "./motion"

let holding = $state(false)

function release() {
  holding = false
}

function onFillEnd(e: TransitionEvent) {
  if (!holding || e.propertyName !== "clip-path") return
  holding = false
  session.clearQueue()
}
</script>

<section class="queue" aria-labelledby="queue-heading">
  <div class="queue-head">
    <h2 id="queue-heading">Up next</h2>
    {#if view.queue.length}
      <span class="queue-count">{String(view.queue.length).padStart(2, "0")}</span>
      <button
        class="hold-btn"
        class:holding
        type="button"
        title="Press and hold to clear the queue"
        onpointerdown={(e) => e.button === 0 && (holding = true)}
        onpointerup={release}
        onpointerleave={release}
        onpointercancel={release}
        oncontextmenu={(e) => e.preventDefault()}
        onkeydown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault()
            holding = true
          }
        }}
        onkeyup={release}
        onblur={release}
      >
        <span class="hold-label">Hold to clear</span>
        <span class="hold-fill" aria-hidden="true" ontransitionend={onFillEnd}>Hold to clear</span>
      </button>
    {/if}
  </div>

  <!-- list and empty state share one grid cell, so clearing crossfades
       on opacity/transform alone instead of collapsing every row -->
  <div class="queue-body">
    {#if view.queue.length === 0}
      <div class="empty" in:rise={{ y: 8, blur: 0, delay: 60 }}>
        <div class="empty-reel" aria-hidden="true"><i></i><i></i><i></i></div>
        <p>The reel is empty.</p>
        <span>Queue a link and it lines up here, playing in order.</span>
      </div>
    {:else}
      <ol class="queue-list" out:fade={{ duration: 150 }}>
        {#each view.queue as id, i (id)}
          <QueueRow
            {id}
            index={i}
            active={i === view.queueIndex}
            playing={i === view.queueIndex && view.isPlaying}
            onplay={() => session.loadVideo(id)}
            onremove={() => session.removeFromQueue(i)}
            onreorder={(from, to) => session.reorderQueue(from, to)}
          />
        {/each}
      </ol>
    {/if}
  </div>
</section>
