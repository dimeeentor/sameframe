/** Theme. Not sync domain (the server never sees it), so it stays out of the
 *  session. */
import { createEffect, createMemo, createRoot, createStore, flush, snapshot } from "solid-js"
import { mediaQuery } from "./media"
import { css, inkFor, type Rgb } from "./color"

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
  | "alpine"
  | "glacier"
  | "lavender"
  | "orchard"
  | "peach"
  | "parchment"
  | "terracotta"
  | "mono"
  | "custom"

/** Order and labels for the picker. Colours live in styles/palettes.css. */
export const PALETTES: readonly { id: Palette; label: string }[] = [
  { id: "raspberry", label: "Raspberry" },
  { id: "alpine", label: "Alpine Milk" },
  { id: "glacier", label: "Glacier Mint" },
  { id: "lavender", label: "Lavender Postcard" },
  { id: "orchard", label: "Orchard Breeze" },
  { id: "peach", label: "Peach Veranda" },
  { id: "parchment", label: "Sunlit Parchment" },
  { id: "terracotta", label: "Terracotta Noon" },
  { id: "mono", label: "Mono" },
  { id: "custom", label: "Custom" },
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

/** Exact colours typed as RGB, per mode. Null falls back to the hue/intensity/page model. */
export type ExactColours = { accent: Rgb | null; page: Rgb | null }

/** Custom palette: accent hue and intensity, page hue and tint strength, plus
 *  optional exact colours for each mode. */
export type CustomPalette = {
  hue: number
  chroma: number
  tint: number
  k: number
  exact: { light: ExactColours; dark: ExactColours }
}

const CUSTOM_KEY = "sameframe-custom"

function readCustom(): CustomPalette {
  // Balanced intensity on a Soft page, so the defaults match a step and a tile.
  const fallback: CustomPalette = {
    hue: 5,
    chroma: 0.14,
    tint: 5,
    k: 1.3,
    exact: { light: { accent: null, page: null }, dark: { accent: null, page: null } },
  }
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "{}")
    const num = (x: unknown, d: number) => (Number.isFinite(x) ? (x as number) : d)
    const rgb = (x: unknown): Rgb | null =>
      Array.isArray(x) && x.length === 3 && x.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
        ? (x as Rgb)
        : null
    const slots = (x: { accent?: unknown; page?: unknown } | undefined): ExactColours => ({
      accent: rgb(x?.accent),
      page: rgb(x?.page),
    })
    return {
      hue: num(v.hue, fallback.hue),
      chroma: num(v.chroma, fallback.chroma),
      tint: num(v.tint, fallback.tint),
      k: num(v.k, fallback.k),
      exact: { light: slots(v.exact?.light), dark: slots(v.exact?.dark) },
    }
  } catch {
    return fallback
  }
}

const prefersLight = mediaQuery("(prefers-color-scheme: light)")

export const [settings, setSettings] = createStore({
  themeMode: readMode() ?? ("system" as ThemeMode),
  palette: readPalette(),
  custom: readCustom(),
})

/** The theme actually painted. */
export const theme = createRoot(() => {
  const theme = createMemo<Theme>(() =>
    settings.themeMode === "system" ? (prefersLight() ? "light" : "dark") : settings.themeMode,
  )
  const root = document.documentElement
  createEffect(theme, (t) => root.setAttribute("data-theme", t))
  createEffect(
    () => settings.palette,
    (p) => root.setAttribute("data-palette", p),
  )
  createEffect(
    () => {
      const c = settings.custom
      const { light, dark } = c.exact
      // palettes.css prefers the exact colours over the derived ones when they're set.
      return [
        ...(["hue", "chroma", "tint", "k"] as const).map((k) => [`--custom-${k}`, String(c[k])]),
        ["--custom-accent", light.accent && css(light.accent)],
        ["--custom-accent-d", dark.accent && css(dark.accent)],
        ["--custom-ink", light.accent && inkFor(light.accent)],
        ["--custom-ink-d", dark.accent && inkFor(dark.accent)],
        ["--custom-page", light.page && css(light.page)],
        ["--custom-page-d", dark.page && css(dark.page)],
      ] as [string, string | null][]
    },
    (vars) => {
      for (const [name, v] of vars) {
        if (v) root.style.setProperty(name, v)
        else root.style.removeProperty(name)
      }
    },
  )
  return theme
})

export function setThemeMode(mode: ThemeMode) {
  setSettings((d) => void (d.themeMode = mode))
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {}
}

export function setPalette(palette: Palette) {
  setSettings((d) => void (d.palette = palette))
  try {
    localStorage.setItem(PALETTE_KEY, palette)
  } catch {}
}

export function saveCustom() {
  flush() // writes are staged until the next microtask; persist what was just set
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(snapshot(settings.custom)))
  } catch {}
}

/** Light -> dark -> system, for the single-button desktop control. */
export function cycleTheme() {
  const i = THEME_MODES.indexOf(settings.themeMode)
  setThemeMode(THEME_MODES[(i + 1) % THEME_MODES.length])
}
