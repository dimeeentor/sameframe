<script lang="ts">
  import { session } from "../state/session.svelte"
  import { setMusicMode } from "../state/settings.svelte"
  import { parseVideoId } from "../app/domain"

  let value = $state("")
  let invalid = $state(false)
  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let input: HTMLInputElement | undefined = $state()

  export function focus() {
    input?.focus()
  }

  function reject() {
    invalid = true
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (invalid = false), 1200)
  }

  function playNow() {
    const id = parseVideoId(value)
    if (!id) return reject()
    setMusicMode(false)
    session.loadVideo(id)
    value = ""
  }

  function addToQueue() {
    const id = parseVideoId(value)
    if (!id) return reject()
    setMusicMode(false)
    session.addToQueue(id)
    value = ""
  }
</script>

<div class="composer" class:invalid>
  <input
    bind:this={input}
    bind:value
    type="text"
    placeholder="Paste a YouTube link — Enter to queue"
    spellcheck="false"
    onkeydown={(e) => {
      if (e.key === "Enter") addToQueue()
      if (e.key === "Escape") input?.blur()
    }}
  />
  <div class="composer-actions">
    <button class="btn" onclick={addToQueue}>Queue</button>
    <button class="btn solid" onclick={playNow}>Play now</button>
  </div>
</div>
