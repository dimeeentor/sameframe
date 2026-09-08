<script lang="ts">
  import { view, session } from "../state/session.svelte"
  import { settings, setMusicMode, toggleTheme } from "../state/settings.svelte"
  import { parseRoomCode } from "../app/domain"

  let copied = $state(false)
  let menuOpen = $state(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  let wrap: HTMLDivElement | undefined = $state()
  let joinCode = $state("")
  let joinError = $state("")

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

  function doJoin() {
    const parsed = parseRoomCode(joinCode)
    if (!parsed) {
      joinError = "Enter a 6-character code"
      return
    }
    joinError = ""
    session.joinRoom(parsed)
  }

  function newRoom() {
    session.createNewRoom()
  }

  function onDocumentClick(e: MouseEvent) {
    if (menuOpen && wrap && !wrap.contains(e.target as Node)) menuOpen = false
  }
</script>

<svelte:document onclick={onDocumentClick} />

<header class="topbar">
  <div class="topbar-inner">
    <div class="wordmark">Sameframe</div>
    <div class="topbar-right">
      <div class="status mono">
        <span class="status-item">
          <span class={dotClass}></span>
          {connText}
        </span>
        <span class="status-item">
          {view.viewerCount} viewer{view.viewerCount !== 1 ? "s" : ""}
        </span>
        {#if view.roomCode}
          <span class="status-item">
            <span class="room-code" title="Room code. Share this">
              {view.roomCode}
            </span>
          </span>
        {/if}
      </div>

      <button class="btn" title="Copy invite link" onclick={share}>
        {copied ? "Copied" : "Share"}
      </button>

      <button
        class="btn icon"
        title={settings.theme === "light" ? "Switch to dark" : "Switch to light"}
        aria-label="Toggle theme"
        onclick={toggleTheme}
      >
        {#if settings.theme === "light"}
          <!-- moon -->
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M13.4 9.7A5.8 5.8 0 0 1 6.3 2.6a5.9 5.9 0 1 0 7.1 7.1Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
          </svg>
        {:else}
          <!-- sun -->
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <circle
              cx="8"
              cy="8"
              r="3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path
              d="M8 .8v2M8 13.2v2M.8 8h2M13.2 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
        {/if}
      </button>

      <div class="menu-wrap" bind:this={wrap}>
        <button
          class="btn icon burger"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onclick={() => (menuOpen = !menuOpen)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        {#if menuOpen}
          <div class="menu-panel" role="menu">
            <button
              class="menu-item"
              class:active={settings.musicMode}
              type="button"
              onclick={() => setMusicMode(!settings.musicMode)}
            >
              Music mode
              <span class="menu-flag">{settings.musicMode ? "On" : "Off"}</span>
            </button>
            <button class="menu-item" type="button" onclick={newRoom}>
              New room
            </button>
            <div class="menu-sep"></div>
            <div class="menu-section">
              <span class="mono">Join a room</span>
              <div class="menu-join">
                <input
                  class="menu-input"
                  placeholder="Room code"
                  maxlength={6}
                  bind:value={joinCode}
                  onkeydown={(e) => e.key === "Enter" && doJoin()}
                />
                <button class="btn solid" type="button" onclick={doJoin}>
                  Join
                </button>
              </div>
              {#if joinError}<div class="menu-error">{joinError}</div>{/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>
