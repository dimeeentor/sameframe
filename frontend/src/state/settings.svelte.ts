/** Theme + music mode. Not sync domain (the server never sees them), so they
 *  stay out of the session. Side effects apply on change and at module init. */

export type Theme = "light" | "dark"

/** The pre-rewrite app persisted its system-preference fallback under
 *  "yt-theme" on every load, so that key can hold a value the user never
 *  chose — a fresh key holds explicit choices only. */
const THEME_KEY = "sameframe-theme"

function parseTheme(v: string | null): Theme | null {
  return v === "light" || v === "dark" ? v : null
}

function systemTheme(): Theme {
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
}

const storedTheme = parseTheme(localStorage.getItem(THEME_KEY))

export const settings = $state({
  theme: storedTheme ?? systemTheme(),
  musicMode: localStorage.getItem("yt-music") === "1",
})

let followsSystem = storedTheme === null

function applyTheme() {
  document.documentElement.setAttribute("data-theme", settings.theme)
}
function applyMusic() {
  document.body.classList.toggle("music", settings.musicMode)
}

applyTheme()
applyMusic()

if (followsSystem) {
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (!followsSystem) return
    settings.theme = systemTheme()
    applyTheme()
  })
}

export function toggleTheme() {
  followsSystem = false
  settings.theme = settings.theme === "light" ? "dark" : "light"
  localStorage.setItem(THEME_KEY, settings.theme)
  applyTheme()
}

export function setMusicMode(on: boolean) {
  settings.musicMode = on
  localStorage.setItem("yt-music", on ? "1" : "0")
  applyMusic()
}
