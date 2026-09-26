<script lang="ts">
import type { Snippet } from "svelte"
import { view } from "../state/session.svelte"
import { layout } from "../state/media.svelte"
import Icon from "./Icon.svelte"
import InviteButton from "./InviteButton.svelte"
import RoomTools from "./RoomTools.svelte"
import Sheet from "./Sheet.svelte"
import ThemeSwitch from "./ThemeSwitch.svelte"
import { rise } from "./motion"

let { children }: { children?: Snippet } = $props()

let menuOpen = $state(false)

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

{#snippet presence()}
  <div class="presence" data-conn={view.connection} title="Connection status and viewers">
    <span class="presence-dot" aria-hidden="true"></span>
    <span class="presence-conn">{connText}</span>
    <span class="presence-sep" aria-hidden="true"></span>
    <span class="presence-count">
      {#key view.viewerCount}
        <span class="presence-num" in:rise={{ y: 6, blur: 2, duration: 240 }}>{view.viewerCount}</span>
      {/key}
      <span class="presence-label">watching</span>
    </span>
  </div>
{/snippet}

{#snippet wordmark()}
  <span class="wordmark">Same<em>frame</em></span>
{/snippet}

{#if layout.compact}
  <header class="topbar compact">
    {@render wordmark()}
    {@render presence()}
    <button
      class="icon-btn"
      type="button"
      aria-label="Room and settings"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = true)}
    >
      <Icon name="menu" stroke={2} />
    </button>
  </header>

  <Sheet open={menuOpen} onclose={() => (menuOpen = false)} label="Room and settings">
    <section class="sheet-section room-card">
      <span class="eyebrow">You're in room</span>
      <span class="room-card-code">{view.roomCode ?? "······"}</span>
      <InviteButton block />
    </section>

    <section class="sheet-section">
      <span class="eyebrow">Appearance</span>
      <ThemeSwitch labelled />
    </section>

    <section class="sheet-section">
      <span class="eyebrow">Somewhere else</span>
      <RoomTools stacked />
    </section>
  </Sheet>
{:else}
  <header class="topbar">
    <div class="topbar-lead">
      {@render wordmark()}
      {@render presence()}
    </div>

    <div class="topbar-composer">
      {@render children?.()}
    </div>

    <div class="topbar-actions">
      <ThemeSwitch />
      {#if view.roomCode}
        <span class="room-chip" title="Room code">
          <span class="room-chip-label">Room</span>
          {view.roomCode}
        </span>
      {/if}
      <InviteButton />
    </div>
  </header>
{/if}
