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

export type Palette =
  | "raspberry"
  | "merino"
  | "alpine"
  | "buttercream"
  | "coastal"
  | "glacier"
  | "ivory"
  | "lavender"
  | "newsprint"
  | "orchard"
  | "peach"
  | "porcelain"
  | "silver"
  | "parchment"
  | "terracotta"

/** Order and labels for the picker. Colours live in styles/palettes.css. */
export const PALETTES: readonly { id: Palette; label: string }[] = [
  { id: "raspberry", label: "Raspberry" },
  { id: "merino", label: "Merino Light" },
  { id: "alpine", label: "Alpine Milk" },
  { id: "buttercream", label: "Buttercream Diner" },
  { id: "coastal", label: "Coastal Linen" },
  { id: "glacier", label: "Glacier Mint" },
  { id: "ivory", label: "Ivory Gallery" },
  { id: "lavender", label: "Lavender Postcard" },
  { id: "newsprint", label: "Newsprint Fog" },
  { id: "orchard", label: "Orchard Breeze" },
  { id: "peach", label: "Peach Veranda" },
  { id: "porcelain", label: "Porcelain Morning" },
  { id: "silver", label: "Silver Point Light" },
  { id: "parchment", label: "Sunlit Parchment" },
  { id: "terracotta", label: "Terracotta Noon" },
]

const PALETTE_KEY = "sameframe-palette"

function readPalette(): Palette {
  try {
    const v = localStorage.getItem(PALETTE_KEY)
    return PALETTES.find((p) => p.id === v)?.id ?? "raspberry"
  } catch {
    return "raspberry"
  }
}

const prefersLight = new MediaQuery("prefers-color-scheme: light")

class Settings {
  themeMode = $state<ThemeMode>(readMode() ?? "system")
  palette = $state<Palette>(readPalette())
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
  $effect(() => {
    document.documentElement.setAttribute("data-palette", settings.palette)
  })
})

export function setThemeMode(mode: ThemeMode) {
  settings.themeMode = mode
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {}
}

export function setPalette(palette: Palette) {
  settings.palette = palette
  try {
    localStorage.setItem(PALETTE_KEY, palette)
  } catch {}
}

/** Light -> dark -> system, for the single-button desktop control. */
export function cycleTheme() {
  const i = THEME_MODES.indexOf(settings.themeMode)
  setThemeMode(THEME_MODES[(i + 1) % THEME_MODES.length])
}
