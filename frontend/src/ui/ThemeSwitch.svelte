<script lang="ts">
import { setThemeMode, settings, THEME_MODES, type ThemeMode } from "../state/settings.svelte"
import Icon, { type IconName } from "./Icon.svelte"

const META: Record<ThemeMode, { label: string; icon: IconName }> = {
  light: { label: "Light", icon: "sun" },
  dark: { label: "Dark", icon: "moon" },
  system: { label: "Device", icon: "device" },
}

const index = $derived(THEME_MODES.indexOf(settings.themeMode))
</script>

<div
  class="theme-switch"
  role="group"
  aria-label="Theme"
  style:--i={index}
  style:--n={THEME_MODES.length}
>
  <span class="theme-thumb" aria-hidden="true"></span>
  {#each THEME_MODES as mode (mode)}
    <button
      type="button"
      aria-pressed={settings.themeMode === mode}
      class={{ on: settings.themeMode === mode }}
      onclick={() => setThemeMode(mode)}
    >
      <Icon name={META[mode].icon} />
      <span>{META[mode].label}</span>
    </button>
  {/each}
</div>
