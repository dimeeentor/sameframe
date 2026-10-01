<script lang="ts">
import { onMount } from "svelte"
import { fade } from "svelte/transition"
import { session, view } from "../state/session.svelte"
import { titleOf } from "../state/titles.svelte"
import Icon from "./Icon.svelte"
import { swap } from "./motion"

let { stageHeight = $bindable(0) }: { stageHeight?: number } = $props()

let host: HTMLDivElement | undefined = $state()

onMount(() => {
  if (host) session.attachPlayer(host)
})

const pad = (n: number) => String(n).padStart(2, "0")

const gateHint = $derived(
  view.videoId
    ? `${titleOf(view.videoId)} is already playing. Join to pick it up in sync.`
    : "Join first, then paste a YouTube link to start watching together.",
)
</script>

<div class="stage" class:playing={view.isPlaying && !!view.videoId} bind:clientHeight={stageHeight}>
  <div class="frame">
    <div class="player-wrap">
      <div bind:this={host} id="player"></div>

      <!-- one persistent placeholder so the leader keeps sweeping while only the copy swaps -->
      {#if !view.joined || !view.videoId}
        <div class="placeholder" in:fade={{ duration: 200 }} out:fade={{ duration: 260 }}>
          <div class="leader" aria-hidden="true">
            <span class="leader-sweep"></span>
            <span class="leader-ring"></span>
            <span class="leader-ring inner"></span>
            <span class="leader-cross"></span>
          </div>
          {#key view.joined}
            <div class="placeholder-inner" in:swap>
              {#if !view.joined}
                <span class="eyebrow">Reel 00 · Standby</span>
                <h2>Watch together</h2>
                <p>{gateHint}</p>
                <button class="btn primary large" type="button" onclick={() => session.join()}>
                  Join room
                </button>
              {:else}
                <span class="eyebrow">Reel 00 · Empty</span>
                <h2>Nothing on screen yet</h2>
                <p>Paste a YouTube link to start the show.</p>
              {/if}
            </div>
          {/key}
        </div>
      {/if}
    </div>
  </div>

  {#if view.videoId}
    <div class="now" transition:fade={{ duration: 160 }}>
      <span class="now-state" title={view.isPlaying ? "Playing" : "Paused"}>
        {#if view.isPlaying}
          <span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        {:else}
          <Icon name="pause" stroke={2.4} />
        {/if}
      </span>
      <span class="now-title-cell">
        {#key view.videoId}
          <span class="now-title" in:swap>{titleOf(view.videoId)}</span>
        {/key}
      </span>
      {#if view.queueIndex >= 0}
        <span class="now-pos" aria-label="Video {view.queueIndex + 1} of {view.queue.length}">
          {pad(view.queueIndex + 1)}<i>/</i>{pad(view.queue.length)}
        </span>
      {/if}
    </div>
  {/if}
</div>
