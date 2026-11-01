<script lang="ts">
import { notFound, view } from "../state/session.svelte"
import { layout } from "../state/media.svelte"
import CopyButton from "./CopyButton.svelte"
import RoomTools from "./RoomTools.svelte"
import Sheet from "./Sheet.svelte"
import ViewersSheet from "./ViewersSheet.svelte"
import PaletteSwitch from "./PaletteSwitch.svelte"
import ThemeSwitch from "./ThemeSwitch.svelte"
import { rise } from "./motion"

let menuOpen = $state(false)
let viewersOpen = $state(false)
let menuTouched = $state(false)
let menuBtn: HTMLButtonElement | undefined = $state()
let viewersBtn: HTMLButtonElement | undefined = $state()

const connText = $derived(
  view.connection === "open"
    ? "Live"
    : view.connection === "polling"
    ? "Polling"
    : view.connection === "connecting"
    ? "Connecting"
    : "Reconnecting",
)
</script>

{#snippet presenceBody()}
  <span class="presence-dot" aria-hidden="true"></span>
  <span class="presence-conn">
    <span aria-hidden="true">Connecting</span>
    <span class="shown">{connText}</span>
  </span>
  <span class="presence-sep" aria-hidden="true"></span>
  <span class="presence-count">
    {#key view.viewerCount}
      <span class="presence-num" in:rise={{ y: 6, blur: 2, duration: 240 }}>{view.viewerCount}</span>
    {/key}
    <span class="presence-label">watching</span>
  </span>
{/snippet}

<header class={["topbar", { bare: notFound.code }]}>
  <span class="wordmark">Same<em>frame</em></span>

  {#if !notFound.code}
  {#if view.isOwner}
    <button
      bind:this={viewersBtn}
      class="presence presence-btn"
      type="button"
      data-conn={view.connection}
      title="Manage viewers"
      aria-label="Manage viewers"
      onclick={() => (viewersOpen = true)}
    >
      {@render presenceBody()}
    </button>
  {:else}
    <div class="presence" data-conn={view.connection} title="Connection status and viewers">
      {@render presenceBody()}
    </div>
  {/if}

  <div class="topbar-actions">
    {#if !layout.compact}
      <span class="room-chip" title="Room code">
        <span class="room-chip-label">Room</span>
        {view.roomCode ?? "······"}
      </span>
      <CopyButton text={() => view.shareUrl} label="Invite" done="Link copied" title="Copy invite link" />
    {/if}
    <button
      bind:this={menuBtn}
      class="icon-btn"
      type="button"
      aria-label="Room and settings"
      aria-expanded={menuOpen}
      onclick={() => ((menuOpen = true), (menuTouched = true))}
    >
      <svg class="burger" data-open={menuOpen} data-touched={menuTouched} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <g class="lane a"><rect x="4" y="7" width="16" height="2" rx="1" /></g>
        <g class="lane b"><rect x="4" y="15" width="16" height="2" rx="1" /></g>
      </svg>
    </button>
  </div>
  {/if}
</header>

<Sheet open={menuOpen} onclose={() => (menuOpen = false)} anchor={menuBtn} label="Room and settings">
  {#if layout.compact}
    <section class="sheet-section room-card">
      <span class="eyebrow">You're in room</span>
      <span class="room-card-code">{view.roomCode ?? "······"}</span>
      <CopyButton text={() => view.shareUrl} label="Copy invite link" done="Link copied" title="Copy invite link" block />
    </section>
  {/if}

  <section class="sheet-section">
    <span class="eyebrow">Appearance</span>
    <ThemeSwitch />
    <PaletteSwitch />
  </section>

  <section class="sheet-section">
    <span class="eyebrow">Another room</span>
    <RoomTools />
  </section>
</Sheet>

{#if view.isOwner}
  <ViewersSheet open={viewersOpen} onclose={() => (viewersOpen = false)} anchor={viewersBtn} />
{/if}

<style>
/* Lines trade places. Each lane carries the vertical travel (a transition, so it
   retargets if toggled mid-flight); the rect carries a sideways bow and the
   shortening, so the two lines pass on opposite sides instead of colliding. */
.burger rect {
  fill: currentColor;
  transform-box: fill-box;
  transform-origin: 100% 50%;
}
.lane {
  transition: transform 340ms var(--ease-drawer);
}
.b {
  transition-delay: 30ms;
}
.burger[data-open="true"] .a {
  transform: translateY(8px);
}
.burger[data-open="true"] .b {
  transform: translateY(-8px);
}
.b rect {
  transition: scale 220ms var(--ease-out);
}
.burger[data-open="true"] .b rect {
  scale: 0.56 1;
}

.burger[data-touched="true"] rect {
  animation-duration: 340ms;
  animation-timing-function: ease-in-out;
}
.burger[data-touched="true"][data-open="true"] .a rect { animation-name: bow-l; }
.burger[data-touched="true"][data-open="false"] .a rect { animation-name: bow-l-back; }
.burger[data-touched="true"][data-open="true"] .b rect { animation-name: bow-r; animation-delay: 30ms; }
.burger[data-touched="true"][data-open="false"] .b rect { animation-name: bow-r-back; animation-delay: 30ms; }

@keyframes bow-l { 50% { transform: translateX(-3px); } }
@keyframes bow-l-back { 50% { transform: translateX(-3px); } }
@keyframes bow-r { 50% { transform: translateX(3px); } }
@keyframes bow-r-back { 50% { transform: translateX(3px); } }

@media (prefers-reduced-motion: reduce) {
  .lane,
  .b rect {
    transition-duration: 0s;
  }
  .burger rect {
    animation: none !important;
  }
}
.presence-btn {
  position: relative;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .presence-btn:hover {
    border-color: var(--line-strong);
    color: var(--ink);
  }
}
.presence-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
