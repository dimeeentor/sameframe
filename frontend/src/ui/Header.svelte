<script lang="ts">
import { notFound, view } from "../state/session.svelte"
import { layout } from "../state/media.svelte"
import Icon from "./Icon.svelte"
import CopyButton from "./CopyButton.svelte"
import RoomTools from "./RoomTools.svelte"
import Sheet from "./Sheet.svelte"
import ViewersSheet from "./ViewersSheet.svelte"
import ThemeSwitch from "./ThemeSwitch.svelte"
import { rise } from "./motion"

let menuOpen = $state(false)
let viewersOpen = $state(false)

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
      class="icon-btn"
      type="button"
      aria-label="Room and settings"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = true)}
    >
      <Icon name="menu" stroke={2} />
    </button>
  </div>
  {/if}
</header>

<Sheet open={menuOpen} onclose={() => (menuOpen = false)} label="Room and settings">
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
  </section>

  <section class="sheet-section">
    <span class="eyebrow">Somewhere else</span>
    <RoomTools />
  </section>
</Sheet>

{#if view.isOwner}
  <ViewersSheet open={viewersOpen} onclose={() => (viewersOpen = false)} />
{/if}

<style>
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
