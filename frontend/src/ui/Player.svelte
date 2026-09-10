<script lang="ts">
import { onMount } from "svelte"
import { session, view } from "../state/session.svelte"
import { titleOf } from "../state/titles.svelte"

let { stageHeight = $bindable(0) }: { stageHeight?: number } = $props()

let host: HTMLDivElement | undefined = $state()

onMount(() => {
  if (host) session.attachPlayer(host)
})

const position = $derived(
  view.queueIndex >= 0 ? `${view.queueIndex + 1} / ${view.queue.length}` : "",
)

const gateHint = $derived(
  view.videoId
    ? `${titleOf(view.videoId)} is already playing. Join to pick it up in sync.`
    : "Join first, then paste a YouTube link to start watching together.",
)
</script>

<div class="stage" bind:clientHeight={stageHeight}>
  <div class="player-wrap">
    <div bind:this={host} id="player"></div>

    {#if !view.joined}
      <div class="placeholder">
        <div class="placeholder-inner">
          <h2>Watch together</h2>
          <p>{gateHint}</p>
          <button class="btn primary gate-btn" onclick={() => session.join()}>
            Join room
          </button>
        </div>
      </div>
    {:else if !view.videoId}
      <div class="placeholder">
        <div class="placeholder-inner">
          <h2>Nothing playing yet</h2>
          <p>Paste a YouTube link above to start watching together.</p>
        </div>
      </div>
    {/if}
  </div>

  {#if view.videoId}
    <div class="now-playing">
      {#if view.isPlaying}
        <span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>
      {/if}
      <span class="title">{titleOf(view.videoId)}</span>
      {#if position}<span class="pos">{position}</span>{/if}
    </div>
  {/if}
</div>
