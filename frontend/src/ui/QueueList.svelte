<script lang="ts">
  import { session, view } from "../state/session.svelte"
  import { setMusicMode } from "../state/settings.svelte"
  import QueueRow from "./QueueRow.svelte"

  const count = $derived(String(view.queue.length).padStart(2, "0"))
</script>

<section class="queue-col">
  <div class="queue-head">
    <h2>
      Queue
      <span class="mono">{count}</span>
    </h2>
    {#if view.queue.length}
      <button class="queue-clear mono" onclick={() => session.clearQueue()}>
        Clear
      </button>
    {/if}
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
    <div class="empty mono">Queue is empty</div>
  {/if}
</section>
