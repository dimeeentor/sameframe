<script lang="ts">
import { session, view } from "../state/session.svelte"
import QueueRow from "./QueueRow.svelte"
</script>

<section class="queue">
  <div class="queue-head">
    <h2>Up next</h2>
    {#if view.queue.length}
      <span class="queue-count">{view.queue.length}</span>
    {/if}
    {#if view.queue.length}
      <button class="btn ghost tiny" type="button" onclick={() => session.clearQueue()}>
        Clear
      </button>
    {/if}
  </div>

  {#if view.queue.length === 0}
    <div class="empty">Nothing queued. Add a link and it shows up here.</div>
  {:else}
    <ul class="queue-list">
      {#each view.queue as id, i (id)}
        <QueueRow
          {id}
          index={i}
          active={i === view.queueIndex}
          onplay={() => {
            session.loadVideo(id)
          }}
          onremove={() => session.removeFromQueue(i)}
          onreorder={(from, to) => session.reorderQueue(from, to)}
        />
      {/each}
    </ul>
  {/if}
</section>
