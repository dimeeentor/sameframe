<script lang="ts">
import { view } from "../state/session.svelte"
import {
  cycleTheme,
  setThemeMode,
  settings,
  THEME_MODES,
  type ThemeMode,
} from "../state/settings.svelte"
import { layout } from "../state/media.svelte"
import RoomTools from "./RoomTools.svelte"

let copied = $state(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
let menuOpen = $state(false)
let wrap: HTMLDivElement | undefined = $state()

const THEME_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "Device",
}
const nextMode = $derived(
  THEME_MODES[
    (THEME_MODES.indexOf(settings.themeMode) + 1) %
    THEME_MODES.length
  ],
)

const connText = $derived(
  view.connection === "open"
    ? "live"
    : view.connection === "polling"
    ? "polling"
    : view.connection === "connecting"
    ? "connecting"
    : "reconnecting",
)
const dotClass = $derived(view.connection === "open" ? "dot on" : "dot off")

async function share() {
  try {
    await navigator.clipboard.writeText(view.shareUrl)
    copied = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied = false), 1500)
  } catch {
    prompt("Copy link:", view.shareUrl)
  }
}

function onDocumentClick(e: MouseEvent) {
  if (menuOpen && wrap && !wrap.contains(e.target as Node)) menuOpen = false
}
</script>

<svelte:document onclick={onDocumentClick} />
<svelte:window onkeydown={(e) => e.key === "Escape" && (menuOpen = false)} />

{#snippet presence()}
  <div class="presence" title="Connection status and viewers">
  <span class={dotClass}></span>
  <span class="conn">{connText}</span>
  <span class="count">{view.viewerCount} watching</span>
</div>
{/snippet}

{#snippet themeGlyph(mode: ThemeMode)}
  {#if mode === "light"}
    <svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="4" />
  <path
    d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
  />
</svg>
  {:else if mode === "dark"}
    <svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
</svg>
  {:else}
    <svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
  <path d="M9 20h6M12 16.5V20" />
</svg>
  {/if}
{/snippet}

{#snippet shareLabel()}
  {#if copied}
    <svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="m20 6-11 11-5-5" />
</svg>
    Copied
  {:else}
    <svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <circle cx="18" cy="5" r="3" />
  <circle cx="6" cy="12" r="3" />
  <circle cx="18" cy="19" r="3" />
  <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
</svg>
    Share
  {/if}
{/snippet}

{#if layout.compact}
  <header class="topbar compact">
    {@render presence()}

    <div class="menu-wrap" bind:this={wrap}>
      <button
        class="icon-btn burger"
        type="button"
        aria-label="Menu"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          {#if menuOpen}
            <path d="M6 6l12 12M18 6L6 18" />
          {:else}
            <path d="M4 7h16M4 12h16M4 17h16" />
          {/if}
        </svg>
      </button>

      {#if menuOpen}
        <div class="menu-panel" role="dialog" aria-label="Menu">
          <div class="segmented theme-seg" role="group" aria-label="Theme">
            {#each THEME_MODES as mode (mode)}
              <button
                type="button"
                class:on={settings.themeMode === mode}
                aria-pressed={settings.themeMode === mode}
                onclick={() => setThemeMode(mode)}
              >
                {@render themeGlyph(mode)}
                {THEME_LABEL[mode]}
              </button>
            {/each}
          </div>

          <div class="menu-divider"></div>

          {#if view.roomCode}
            <div class="menu-room">
              <span>Room</span>
              <span class="code">{view.roomCode}</span>
            </div>
          {/if}

          <button class="btn primary block" type="button" onclick={share}>
            {@render shareLabel()}
          </button>

          <RoomTools stacked />
        </div>
      {/if}
    </div>
  </header>
{:else}
  <header class="topbar">
    <div class="brand">
      <span class="brand-name">Sameframe</span>
    </div>

    {@render presence()}

    <div class="topbar-actions">
      <button
        class="icon-btn"
        type="button"
        title="Theme: {THEME_LABEL[settings.themeMode]} — click for {THEME_LABEL[
          nextMode
        ]}"
        aria-label="Theme: {THEME_LABEL[settings.themeMode]}"
        onclick={cycleTheme}
      >
        {@render themeGlyph(settings.themeMode)}
      </button>

      <span class="topbar-sep"></span>

      {#if view.roomCode}
        <span class="code-chip" title="Room code">{view.roomCode}</span>
      {/if}

      <button
        class="btn primary"
        type="button"
        title="Copy invite link"
        onclick={share}
      >
        {@render shareLabel()}
      </button>
    </div>
  </header>
{/if}
