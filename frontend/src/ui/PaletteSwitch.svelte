<script lang="ts">
import { PALETTES, setPalette, settings } from "../state/settings.svelte"
import CustomTheme from "./CustomTheme.svelte"
import Icon from "./Icon.svelte"

const current = $derived(PALETTES.find((p) => p.id === settings.palette))
</script>

<details class="palette">
  <summary class="palette-summary" data-palette={settings.palette}>
    <span class="palette-swatch"></span>
    <span class="palette-name">{current?.label}</span>
    <Icon name="chevron" stroke={2} />
  </summary>
  <div class="palette-switch" role="group" aria-label="Colour">
    {#each PALETTES as p (p.id)}
      <button
        type="button"
        class="palette-btn"
        data-palette={p.id}
        aria-pressed={settings.palette === p.id}
        aria-label={p.label}
        title={p.label}
        onclick={() => setPalette(p.id)}
      >
        <span class="palette-swatch"></span>
      </button>
    {/each}
  </div>
  {#if settings.palette === "custom"}
    <CustomTheme />
  {/if}
</details>
