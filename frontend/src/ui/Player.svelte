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

{#snippet placeholder(eyebrow: string, heading: string, body: string, join: boolean)}
  <div class="placeholder" out:fade={{ duration: 260 }}>
    <div class="leader" aria-hidden="true">
      <span class="leader-sweep"></span>
      <span class="leader-ring"></span>
      <span class="leader-ring inner"></span>
      <span class="leader-cross"></span>
    </div>
    <div class="placeholder-inner">
      <span class="eyebrow">{eyebrow}</span>
      <h2>{heading}</h2>
      <p>{body}</p>
      {#if join}
        <button class="btn primary large" type="button" onclick={() => session.join()}>
          Join room
        </button>
      {/if}
    </div>
  </div>
{/snippet}

<div class="stage" class:playing={view.isPlaying && !!view.videoId} bind:clientHeight={stageHeight}>
  <div class="frame">
    <div class="player-wrap">
      <div bind:this={host} id="player"></div>

      {#if !view.joined}
        {@render placeholder("Reel 00 · Standby", "Watch together", gateHint, true)}
      {:else if !view.videoId}
        {@render placeholder(
          "Reel 00 · Empty",
          "Nothing on screen yet",
          "Paste a YouTube link to start the show.",
          false,
        )}
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
