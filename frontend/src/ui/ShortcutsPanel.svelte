<script lang="ts">
  let open = $state(false)
  let wrap: HTMLDivElement | undefined = $state()

  const rows = [
    { keys: ["/"], label: "Focus link field" },
    { keys: ["Esc"], label: "Leave link field" },
    { keys: ["Space"], label: "Play / pause" },
    { keys: ["←", "→"], label: "Seek 5 seconds" },
    { keys: ["F"], label: "Fullscreen" },
  ]

  function onDocumentClick(e: MouseEvent) {
    if (open && wrap && !wrap.contains(e.target as Node)) open = false
  }
</script>

<svelte:document onclick={onDocumentClick} />

<div class="shortcuts-wrap" bind:this={wrap}>
  <button
    class="shortcuts-btn"
    type="button"
    aria-label="Show keyboard shortcuts"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    ?
  </button>
  {#if open}
    <div class="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
      <span class="mono">Shortcuts</span>
      {#each rows as row (row.label)}
        <div class="shortcut-row">
          <span>{row.label}</span>
          <span class="shortcut-keys">
            {#each row.keys as key (key)}<kbd>{key}</kbd>{/each}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
