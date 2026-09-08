/** Theme. Not sync domain (the server never sees it), so it stays out of the
 *  session. Side effects apply on change and at module init. */

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

const prefersLight = matchMedia("(prefers-color-scheme: light)")

function systemTheme(): Theme {
  return prefersLight.matches ? "light" : "dark"
}

export const settings = $state({
  themeMode: parseMode(localStorage.getItem(THEME_KEY)) ?? "system",
  /** The theme actually painted. Derived from themeMode, never set directly. */
  theme: "light" as Theme,
})

/** Keep in sync with --bg in app.css and the pre-paint script in index.html. */
const CHROME_COLOR: Record<Theme, string> = {
  light: "#f4f6f9",
  dark: "#0b0f16",
}

function applyTheme() {
  settings.theme = settings.themeMode === "system"
    ? systemTheme()
    : settings.themeMode
  document.documentElement.setAttribute("data-theme", settings.theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", CHROME_COLOR[settings.theme])
}
applyTheme()

// Listen unconditionally: the user can switch back to "system" at any point.
prefersLight.addEventListener("change", () => {
  if (settings.themeMode === "system") applyTheme()
})

export function setThemeMode(mode: ThemeMode) {
  settings.themeMode = mode
  localStorage.setItem(THEME_KEY, mode)
  applyTheme()
}

/** Light -> dark -> system, for the single-button desktop control. */
export function cycleTheme() {
  const i = THEME_MODES.indexOf(settings.themeMode)
  setThemeMode(THEME_MODES[(i + 1) % THEME_MODES.length])
}
