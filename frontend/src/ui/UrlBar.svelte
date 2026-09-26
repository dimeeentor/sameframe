<script lang="ts">
import { session } from "../state/session.svelte"
import { parseVideoId, thumb } from "../app/domain"
import Icon from "./Icon.svelte"
import { shake } from "./motion"

let value = $state("")
let invalid = $state(false)
let focused = $state(false)
let flashTimer: ReturnType<typeof setTimeout> | undefined
let input: HTMLInputElement | undefined = $state()
let root: HTMLDivElement | undefined = $state()

const candidate = $derived(parseVideoId(value))
let loadedThumb = $state<string | null>(null)
const preview = $derived(candidate && loadedThumb === candidate ? candidate : null)

export function focus() {
  input?.focus()
}

function reject() {
  invalid = true
  shake(root)
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

<div class="composer" class:invalid class:has-preview={preview} bind:this={root}>
  <div class="composer-field">
    <span class="composer-lead" aria-hidden="true">
      <span class="composer-glyph"><Icon name="link" /></span>
      {#if candidate}
        <img
          class="composer-thumb"
          src={thumb(candidate)}
          alt=""
          onload={() => (loadedThumb = candidate)}
        />
      {/if}
    </span>
    <input
      bind:this={input}
      bind:value
      type="text"
      inputmode="url"
      placeholder="Paste a YouTube link or video ID"
      spellcheck="false"
      autocomplete="off"
      aria-label="YouTube link"
      aria-invalid={invalid}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      onkeydown={(e) => {
        if (e.key === "Enter") addToQueue()
        if (e.key === "Escape") input?.blur()
      }}
    />
    {#if !focused && !value}
      <kbd class="composer-kbd" aria-hidden="true">/</kbd>
    {/if}
  </div>
  <div class="composer-actions">
    <button class="btn subtle" type="button" onclick={addToQueue}>
      <Icon name="plus" stroke={2} />
      Queue
    </button>
    <button class="btn primary" type="button" onclick={playNow}>
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7Z" />
      </svg>
      Play now
    </button>
  </div>
</div>
