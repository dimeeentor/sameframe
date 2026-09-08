<script lang="ts">
import { session } from "../state/session.svelte"
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
  session.loadVideo(id)
  value = ""
}

function addToQueue() {
  const id = parseVideoId(value)
  if (!id) return reject()
  session.addToQueue(id)
  value = ""
}
</script>

<div class="composer" class:invalid>
  <div class="composer-field">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
    <input
      bind:this={input}
      bind:value
      type="text"
      placeholder="Paste a YouTube link or video ID"
      spellcheck="false"
      aria-label="YouTube link"
      onkeydown={(e) => {
        if (e.key === "Enter") addToQueue()
        if (e.key === "Escape") input?.blur()
      }}
    />
  </div>
  <button class="add" type="button" onclick={addToQueue}>Add to queue</button>
  <button class="play" type="button" onclick={playNow}>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
    Play now
  </button>
</div>
