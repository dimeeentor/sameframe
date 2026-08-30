<script lang="ts">
  import { view } from "../state/session.svelte"
  import { settings, setMusicMode, toggleTheme } from "../state/settings.svelte"

  let copied = $state(false)
  let menuOpen = $state(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  let wrap: HTMLDivElement | undefined = $state()

  const connText = $derived(
    view.connection === "open"
      ? "connected"
      : view.connection === "polling"
        ? "polling"
        : view.connection === "connecting"
          ? "connecting"
          : "disconnected — retrying…",
  )
  const dotClass = $derived(view.connection === "open" ? "dot on" : "dot off")
  const viewerLabel = $derived(
    `${view.viewerCount} viewer${view.viewerCount !== 1 ? "s" : ""}`,
  )

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

<header>
  <div class="logo">Sameframe</div>
  <div class="header-actions">
    <div class="status">
      <span class={dotClass}></span>
      <span>{connText}</span>
      <span id="clients">{viewerLabel}</span>
    </div>
    <button class="pill" title="Copy invite link" onclick={share}>
      {copied ? "✓ Copied" : "Share"}
    </button>
    <div class="menu-wrap" bind:this={wrap}>
      <button
        class="pill icon"
        aria-label="Menu"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
      >
        Menu
      </button>
      {#if menuOpen}
        <div class="menu-panel">
          <button
            class="menu-item"
            class:active={settings.musicMode}
            type="button"
            onclick={() => setMusicMode(!settings.musicMode)}
          >
            Music mode
          </button>
          <button
            class="menu-item"
            type="button"
            aria-label="Toggle theme"
            onclick={toggleTheme}
          >
            {settings.theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>
