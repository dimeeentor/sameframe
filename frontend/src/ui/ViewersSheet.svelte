<script lang="ts">
import { session, view } from "../state/session.svelte"
import { showToast } from "../state/toast.svelte"
import Sheet from "./Sheet.svelte"

let { open, onclose }: { open: boolean; onclose: () => void } = $props()

async function copyOwnerLink() {
  const link = session.ownerLink()
  if (!link) return
  try {
    await navigator.clipboard.writeText(link)
    showToast("Owner link copied")
  } catch {
    prompt("Copy owner link:", link)
  }
}
</script>

<Sheet {open} {onclose} label="Viewers">
  <section class="sheet-section">
    <span class="eyebrow">Watching</span>
    <ul class="viewers">
      {#each view.viewers as v (v.id)}
        <li class="viewer">
          <span class="viewer-name">{v.label}</span>
          {#if v.isYou}<span class="viewer-tag">you</span>{/if}
          {#if v.isOwner}<span class="viewer-tag">owner</span>{/if}
          {#if !v.isYou}
            <button class="btn subtle" type="button" onclick={() => session.kick(v.id)}>Remove</button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="sheet-section">
    <span class="eyebrow">Owner link</span>
    <p class="viewers-note">Opens this room as owner on another device. Keep it private.</p>
    <button class="btn subtle block" type="button" onclick={copyOwnerLink}>Copy owner link</button>
  </section>
</Sheet>

<style>
.viewers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.viewer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
}
.viewer-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.viewer-tag {
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
}
.viewers-note {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
</style>
