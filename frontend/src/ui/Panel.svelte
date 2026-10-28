<script lang="ts">
import { tick } from "svelte"
import { layout } from "../state/media.svelte"
import { resume } from "../state/session.svelte"
import Icon from "./Icon.svelte"
import QueueList from "./QueueList.svelte"
import Sheet from "./Sheet.svelte"
import UrlBar from "./UrlBar.svelte"

let urlBar: UrlBar | undefined = $state()
let addOpen = $state(false)

export async function focusLink() {
  if (layout.compact) addOpen = true
  await tick()
  urlBar?.focus()
}
</script>

<section class="panel" aria-label="Queue">
  {#if !layout.compact}
    <div class="panel-add" inert={!!resume.code}>
      <UrlBar bind:this={urlBar} />
      {#if resume.code}
        <p class="panel-note">Choose a room first, then add videos.</p>
      {/if}
    </div>
  {/if}
  <QueueList />
</section>

{#if layout.compact}
  <button
    class="fab"
    type="button"
    aria-label="Add a video"
    aria-expanded={addOpen}
    disabled={!!resume.code}
    onclick={() => (addOpen = true)}
  >
    <Icon name="plus" stroke={2.2} />
  </button>
  <Sheet open={addOpen} onclose={() => (addOpen = false)} label="Add a video">
    <UrlBar bind:this={urlBar} ondone={() => (addOpen = false)} />
  </Sheet>
{/if}
