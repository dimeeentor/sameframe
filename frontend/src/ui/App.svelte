<script lang="ts">
import { notFound, session, view } from "../state/session.svelte"
import { ensureTitle, titleOf } from "../state/titles.svelte"
import { isTypingTarget } from "../app/domain"
import Header from "./Header.svelte"
import Player from "./Player.svelte"
import Panel from "./Panel.svelte"
import JoinGate from "./JoinGate.svelte"

let panel: Panel | undefined = $state()
let stageHeight = $state(0)

// fetch titles for the current and every queued video
$effect(() => {
  if (view.videoId) ensureTitle(view.videoId)
  for (const id of view.queue) ensureTitle(id)
})

function onKeydown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const el = e.target instanceof Element ? e.target : null
  if (el?.closest("dialog, [role=dialog]")) return
  if (e.key === " " && el?.closest("button, a")) return
  if (e.key === "/") {
    e.preventDefault()
    panel?.focusLink()
  } else if (e.key === " ") {
    e.preventDefault()
    session.togglePlay()
  } else if (e.key === "ArrowLeft") {
    e.preventDefault()
    session.seekBy(-5)
  } else if (e.key === "ArrowRight") {
    e.preventDefault()
    session.seekBy(5)
  } else if (e.key.toLowerCase() === "f") {
    if (!view.videoId) return
    e.preventDefault()
    session.toggleFullscreen()
  }
}
</script>

<svelte:head>
  <title>{view.videoId ? `${titleOf(view.videoId)} - Sameframe` : "Sameframe"}</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<JoinGate />

<div class="app">
  <Header />
  <main class={["main", { centered: notFound.code }]} style:--stage-h={stageHeight ? `${stageHeight}px` : undefined}>
    {#if notFound.code}
      <div class="kicked">
        <h2 class="kicked-title">Room not found</h2>
        <p class="kicked-note">
          There's no room {notFound.code}. It may have expired, or the code is mistyped.
        </p>
        <button class="btn primary large" type="button" onclick={() => session.createNewRoom()}>
          New room
        </button>
      </div>
    {:else if view.kicked}
      <div class="kicked">
        <h2 class="kicked-title">You left the room</h2>
        <p class="kicked-note">The video stopped so this device can sleep.</p>
        <button class="btn primary large" type="button" onclick={() => session.rejoin()}>Rejoin</button>
      </div>
    {:else}
      <Player bind:stageHeight />
      <Panel bind:this={panel} />
    {/if}
  </main>
</div>

<style>
.kicked {
  grid-column: 1 / -1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  min-height: 50dvh;
  text-align: center;
}
.main.centered {
  align-content: center;
}
.centered .kicked {
  min-height: 0;
}
.kicked-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 2rem;
}
.kicked-note {
  margin: 0;
  color: var(--muted);
}
</style>
