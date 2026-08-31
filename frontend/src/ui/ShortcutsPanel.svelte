<script lang="ts">
  let open = $state(false)
  let wrap: HTMLDivElement | undefined = $state()

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
      <div class="shortcuts-title">Keyboard shortcuts</div>
      <div><kbd>/</kbd><span>Focus link field</span></div>
      <div><kbd>Esc</kbd><span>Leave link field</span></div>
      <div><kbd>Space</kbd><span>Play / pause</span></div>
      <div><kbd>←</kbd><kbd>→</kbd><span>Seek 5 seconds</span></div>
      <div><kbd>F</kbd><span>Toggle fullscreen</span></div>
    </div>
  {/if}
</div>
