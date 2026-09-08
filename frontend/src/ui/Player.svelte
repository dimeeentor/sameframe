<script lang="ts">
import { onMount } from "svelte"
import { session, view } from "../state/session.svelte"
import { titleOf } from "../state/titles.svelte"

let host: HTMLDivElement | undefined = $state()

onMount(() => {
  if (host) session.attachPlayer(host)
})

const position = $derived(
  view.queueIndex >= 0 ? `${view.queueIndex + 1} / ${view.queue.length}` : "",
)
</script>

<div class="stage">
  <div class="player-wrap">
    <div bind:this={host} id="player"></div>

    {#if view.muted}
      <!-- already playing in sync; this click only gives the sound back -->
      <button class="unmute-banner" onclick={() => session.unmute()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          width="14" height="14">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <path d="M19.1 4.9a10 10 0 0 1 0 14.2M15.5 8.5a5 5 0 0 1 0 7" />
        </svg>
        Muted &mdash; tap for sound
      </button>
    {/if}

    {#if !view.videoId}
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
