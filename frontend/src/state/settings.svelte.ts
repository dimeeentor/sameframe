/** Theme. Not sync domain (the server never sees it), so it stays out of the
 *  session. */
import { MediaQuery } from "svelte/reactivity"

export type Theme = "light" | "dark"
/** What the user picked. "system" tracks the OS instead of pinning a theme. */
export type ThemeMode = Theme | "system"

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"]

/** The pre-rewrite app persisted its system-preference fallback under
 *  "yt-theme" on every load, so that key can hold a value the user never
 *  chose. A fresh key holds explicit choices only. */
const THEME_KEY = "sameframe-theme"

function parseMode(v: string | null): ThemeMode | null {
  return v === "light" || v === "dark" || v === "system" ? v : null
}

function readMode(): ThemeMode | null {
  try {
    return parseMode(localStorage.getItem(THEME_KEY))
  } catch {
    return null
  }
}

const prefersLight = new MediaQuery("prefers-color-scheme: light")

class Settings {
  themeMode = $state<ThemeMode>(readMode() ?? "system")
  /** The theme actually painted. */
  theme = $derived<Theme>(
    this.themeMode === "system"
      ? prefersLight.current
        ? "light"
        : "dark"
      : this.themeMode,
  )
}

export const settings = new Settings()

$effect.root(() => {
  $effect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme)
  })
})

export function setThemeMode(mode: ThemeMode) {
  settings.themeMode = mode
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {}
}

/** Light -> dark -> system, for the single-button desktop control. */
export function cycleTheme() {
  const i = THEME_MODES.indexOf(settings.themeMode)
  setThemeMode(THEME_MODES[(i + 1) % THEME_MODES.length])
}
