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

<div class="controls">
  <input
    bind:this={input}
    bind:value
    type="text"
    placeholder="Paste YouTube link, Enter to add to queue"
    spellcheck="false"
    style:border-color={invalid ? "#ef4444" : ""}
    onkeydown={(e) => {
      if (e.key === "Enter") addToQueue()
      if (e.key === "Escape") input?.blur()
    }}
  />
  <button class="secondary" onclick={addToQueue}>Add to queue</button>
  <button id="loadBtn" onclick={playNow}>Play</button>
</div>
