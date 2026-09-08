<script lang="ts">
  import { onMount } from "svelte"
  import { session, view } from "../state/session.svelte"
  import { titleOf } from "../state/titles.svelte"
  import { settings, setMusicMode } from "../state/settings.svelte"
  import { thumb } from "../app/domain"

  let host: HTMLDivElement | undefined = $state()

  onMount(() => {
    if (host) session.attachPlayer(host)
  })

  const label = $derived(view.videoId ? titleOf(view.videoId) : "")
  const pad = (n: number) => String(n).padStart(2, "0")
  const counter = $derived(
    view.queueIndex >= 0
      ? `${pad(view.queueIndex + 1)} / ${pad(view.queue.length)}`
      : "",
  )
</script>

<div class="video-meta">
  <span class="video-label">{label || "No source"}</span>
  <span class="video-index mono">{counter}</span>
</div>
<div class="player-wrap">
  <div bind:this={host} id="player"></div>
  {#if view.muted}
    <!-- already playing in sync; this click only gives the sound back -->
    <button class="unmute-banner" onclick={() => session.unmute()}>
      Muted — tap for sound
    </button>
  {/if}
  {#if !view.videoId}
    <div class="placeholder">
      <span class="mono">Sameframe</span>
      <p class="big">Nothing<br />playing</p>
      <p class="placeholder-sub">
        Paste a YouTube link above. Everyone in the room watches the same frame.
      </p>
    </div>
  {:else if settings.musicMode}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="cover"
      role="button"
      tabindex="0"
      aria-label="Exit music mode"
      onclick={() => setMusicMode(false)}
      onkeydown={(e) => e.key === "Enter" && setMusicMode(false)}
    >
      <img src={thumb(view.videoId)} alt="" />
      <div class="cover-meta">
        <span class="mono"><span class="dot on"></span>Now playing</span>
        <div class="cover-title">{titleOf(view.videoId)}</div>
        <div class="cover-sub">Tap to show the video</div>
      </div>
    </div>
  {/if}
</div>
