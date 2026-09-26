<script lang="ts">
import { setThemeMode, settings, THEME_MODES, type ThemeMode } from "../state/settings.svelte"
import Icon, { type IconName } from "./Icon.svelte"

let { labelled = false }: { labelled?: boolean } = $props()

const META: Record<ThemeMode, { label: string; icon: IconName }> = {
  light: { label: "Light", icon: "sun" },
  dark: { label: "Dark", icon: "moon" },
  system: { label: "Device", icon: "device" },
}

const index = $derived(THEME_MODES.indexOf(settings.themeMode))
</script>

<div
  class="theme-switch"
  class:labelled
  role="radiogroup"
  aria-label="Theme"
  style="--i: {index}; --n: {THEME_MODES.length}"
>
  <span class="theme-thumb" aria-hidden="true"></span>
  {#each THEME_MODES as mode (mode)}
    <button
      type="button"
      role="radio"
      aria-checked={settings.themeMode === mode}
      aria-label={labelled ? undefined : META[mode].label}
      title={labelled ? undefined : `${META[mode].label} theme`}
      class:on={settings.themeMode === mode}
      onclick={() => setThemeMode(mode)}
    >
      <Icon name={META[mode].icon} />
      {#if labelled}<span>{META[mode].label}</span>{/if}
    </button>
  {/each}
</div>
