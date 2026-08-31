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

  const label = $derived.by(() => {
    if (!view.videoId) return ""
    const base = titleOf(view.videoId)
    return view.queueIndex >= 0
      ? `${base}  •  ${view.queueIndex + 1}/${view.queue.length}`
      : base
  })
</script>

<div class="video-header">
  <span class="video-label">{label}</span>
</div>
<div class="player-wrap">
  <div bind:this={host} id="player"></div>
  {#if !view.videoId}
    <div class="placeholder">
      <div class="placeholder-inner">
        <p class="big">Nothing playing yet...</p>
      </div>
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
      <img src={thumb(view.videoId)} alt="cover" />
      <div class="cover-meta">
        <div class="cover-title">{titleOf(view.videoId)}</div>
        <div class="cover-sub">Now playing, tap to show video</div>
      </div>
    </div>
  {/if}
</div>
