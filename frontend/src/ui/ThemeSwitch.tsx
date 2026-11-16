import { For } from "solid-js"
import { setThemeMode, settings, THEME_MODES, type ThemeMode } from "../state/settings"
import Icon, { type IconName } from "./Icon"

const META: Record<ThemeMode, { label: string; icon: IconName }> = {
  light: { label: "Light", icon: "sun" },
  dark: { label: "Dark", icon: "moon" },
  system: { label: "Device", icon: "device" },
}

export default function ThemeSwitch() {
  return (
    <div
      class="theme-switch"
      role="group"
      aria-label="Theme"
      style={{ "--i": THEME_MODES.indexOf(settings.themeMode), "--n": THEME_MODES.length }}
    >
      <span class="theme-thumb" aria-hidden="true"></span>
      <For each={THEME_MODES}>
        {(mode) => (
          <button
            type="button"
            aria-pressed={`${settings.themeMode === mode}`}
            class={{ on: settings.themeMode === mode }}
            onClick={() => setThemeMode(mode)}
          >
            <Icon name={META[mode].icon} />
            <span>{META[mode].label}</span>
          </button>
        )}
      </For>
    </div>
  )
}
