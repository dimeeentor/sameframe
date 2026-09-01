<script lang="ts">
  import { session, view } from "../state/session.svelte"
  import { setMusicMode } from "../state/settings.svelte"
  import QueueRow from "./QueueRow.svelte"
</script>

<section class="queue queue-col">
  <div class="queue-head">
    <h3>
      Queue
      <span>{view.queue.length ? `(${view.queue.length})` : ""}</span>
    </h3>
    <div class="queue-actions">
      <!-- status light, not a control: the server always loops the queue -->
      <label class="toggle" title="The queue always loops">
        <input type="checkbox" checked disabled />
        <span class="toggle-slider"></span>
        <span class="toggle-label">Loop queue</span>
      </label>
      <button class="pill small" onclick={() => session.clearQueue()}>Clear</button>
    </div>
  </div>
  <ul class="queue-list">
    {#each view.queue as id, i (id)}
      <QueueRow
        {id}
        index={i}
        active={i === view.queueIndex}
        onplay={() => {
          setMusicMode(false)
          session.loadVideo(id)
        }}
        onremove={() => session.removeFromQueue(i)}
        onreorder={(from, to) => session.reorderQueue(from, to)}
      />
    {/each}
  </ul>
  {#if view.queue.length === 0}
    <div class="empty">No videos in the queue yet.</div>
  {/if}
</section>
