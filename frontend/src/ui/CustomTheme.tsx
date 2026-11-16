import { createMemo, For, Show } from "solid-js"
import { contrast, css, oklchToRgb, rgbToOklch, type Rgb } from "../state/color"
import { saveCustom, setSettings, settings, theme, type CustomPalette } from "../state/settings"
import Icon from "./Icon"

const STEPS = [
  { c: 0.05, name: "Dusty" },
  { c: 0.09, name: "Muted" },
  { c: 0.14, name: "Balanced" },
  { c: 0.19, name: "Bright" },
  { c: 0.24, name: "Vivid" },
]

/** Page presets. A null tint follows the accent hue. */
const PAGES = [
  { label: "Plain", tint: null, k: 0.15 },
  { label: "Soft", tint: null, k: 1.3 },
  { label: "Rich", tint: null, k: 2.8 },
  { label: "Warm", tint: 70, k: 2.4 },
  { label: "Cool", tint: 235, k: 1.8 },
] as const

const CHANNELS = [
  { ch: "R", name: "red" },
  { ch: "G", name: "green" },
  { ch: "B", name: "blue" },
]

const ROWS = [
  { id: "accent", label: "Accent" },
  { id: "page", label: "Page" },
] as const

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const edit = (fn: (c: CustomPalette) => void) => setSettings((d) => fn(d.custom))

function clearExact(c: CustomPalette, which: "accent" | "page") {
  c.exact.light[which] = c.exact.dark[which] = null
}

/** A page matched to the accent keeps following it, unless it has an exact colour. */
function moveHue(c: CustomPalette, h: number) {
  if (c.tint === c.hue && !c.exact.light.page && !c.exact.dark.page) c.tint = h
  c.hue = h
}

export default function CustomTheme() {
  const c = settings.custom
  const dark = () => theme() === "dark"
  const exact = () => c.exact[theme()]

  const step = () => (exact().accent ? undefined : STEPS.find((s) => s.c === c.chroma))
  const tintOf = (p: (typeof PAGES)[number]) => p.tint ?? c.hue
  const isPage = (p: (typeof PAGES)[number]) => !exact().page && c.tint === tintOf(p) && c.k === p.k

  /** What the theme paints right now: the exact colour, or the derived one. */
  const accent = createMemo<Rgb>(
    () => exact().accent ?? (dark() ? oklchToRgb(0.74, c.chroma * 0.825, c.hue) : oklchToRgb(0.54, c.chroma, c.hue)),
  )
  const page = createMemo<Rgb>(
    () => exact().page ?? (dark() ? oklchToRgb(0.161, 0.009 * c.k, c.tint) : oklchToRgb(0.961, 0.013 * c.k, c.tint)),
  )
  /** Body text on the page, same formula as --ink. */
  const ink = () => (dark() ? oklchToRgb(0.96, 0.008 * c.k, c.tint) : oklchToRgb(0.2, 0.008 * c.k, c.tint))
  const textContrast = createMemo(() => contrast(page(), ink()))
  /** Accent marks (progress, focus, links) need 3:1 against the page. */
  const accentContrast = createMemo(() => contrast(accent(), page()))

  function setHue(e: Event & { currentTarget: HTMLInputElement }) {
    const h = e.currentTarget.valueAsNumber
    edit((c) => {
      moveHue(c, h)
      clearExact(c, "accent")
    })
  }

  function pickStep(chroma: number) {
    edit((c) => {
      c.chroma = chroma
      clearExact(c, "accent")
    })
    saveCustom()
  }

  function pickPage(p: (typeof PAGES)[number]) {
    const tint = tintOf(p)
    edit((c) => {
      c.tint = tint
      c.k = p.k
      clearExact(c, "page")
    })
    saveCustom()
  }

  function setChannel(which: "accent" | "page", i: number, e: Event & { currentTarget: HTMLInputElement }) {
    const v = e.currentTarget.valueAsNumber
    if (!Number.isFinite(v)) return
    const rgb = [...(which === "accent" ? accent() : page())] as Rgb
    rgb[i] = clamp(Math.round(v), 0, 255)
    const mode = theme()
    const isDark = dark()

    // Keep the simple controls, and the other mode's derived colour, in step.
    const o = rgbToOklch(rgb)
    edit((c) => {
      c.exact[mode][which] = rgb
      if (which === "accent") {
        if (o.c > 0.01) moveHue(c, Math.round(o.h))
        c.chroma = Math.round(clamp(isDark ? o.c / 0.825 : o.c, 0, 0.25) * 1000) / 1000
      } else {
        if (o.c > 0.003) c.tint = Math.round(o.h)
        c.k = Math.round(clamp(o.c / (isDark ? 0.009 : 0.013), 0, 3) * 20) / 20
      }
    })
    saveCustom()
  }

  function resetExact() {
    const mode = theme()
    edit((c) => {
      c.exact[mode].accent = c.exact[mode].page = null
    })
    saveCustom()
  }

  return (
    <div class="palette-custom">
      <label class="palette-slider">
        <span>Accent</span>
        <input
          type="range"
          class="hue-range"
          min="0"
          max="360"
          value={c.hue}
          onInput={setHue}
          onChange={saveCustom}
        />
      </label>

      <div class="custom-group">
        <span class="custom-label">
          <span>Intensity</span>
          <span class="custom-picked">{step()?.name}</span>
        </span>
        <div class="custom-steps" role="radiogroup" aria-label="Intensity">
          <For each={STEPS}>
            {(s) => (
              <button
                type="button"
                role="radio"
                class="custom-step"
                aria-checked={`${step() === s}`}
                aria-label={s.name}
                title={s.name}
                style={{ "--c": s.c }}
                onClick={() => pickStep(s.c)}
              ></button>
            )}
          </For>
        </div>
      </div>

      <div class="custom-group" role="radiogroup" aria-label="Page">
        <span class="custom-label">Page</span>
        <div class="custom-pages">
          <For each={PAGES}>
            {(p) => (
              <button
                type="button"
                role="radio"
                class="custom-page"
                aria-checked={`${isPage(p)}`}
                onClick={() => pickPage(p)}
              >
                <span class="custom-tile" style={{ "--tint": tintOf(p), "--tint-k": p.k }}></span>
                {p.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <details class="custom-exact">
        <summary>
          <span>Exact colours</span>
          <Icon name="chevron" stroke={2} />
        </summary>
        <div class="custom-exact-body">
          <For each={ROWS}>
            {(row) => {
              const rgb = () => (row.id === "accent" ? accent() : page())
              return (
                <div class="custom-rgb" role="group" aria-label={`${row.label} colour`}>
                  <span class="custom-swatch" style={{ background: css(rgb()) }}></span>
                  <span>{row.label}</span>
                  <For each={CHANNELS}>
                    {(ch, i) => (
                      <label class="custom-channel">
                        <span aria-hidden="true">{ch.ch}</span>
                        <input
                          type="number"
                          inputmode="numeric"
                          min="0"
                          max="255"
                          aria-label={`${row.label} ${ch.name}`}
                          value={rgb()[i()]}
                          onInput={(e) => setChannel(row.id, i(), e)}
                        />
                      </label>
                    )}
                  </For>
                </div>
              )
            }}
          </For>

          <Show
            when={textContrast() < 4.5}
            fallback={
              <Show when={accentContrast() < 3}>
                <p class="custom-warn">
                  The accent is hard to see on this page ({accentContrast().toFixed(1)}:1). Try a{" "}
                  {dark() ? "lighter" : "darker"} accent.
                </p>
              </Show>
            }
          >
            <p class="custom-warn">
              Text on this page is hard to read ({textContrast().toFixed(1)}:1). Try a {dark() ? "darker" : "lighter"}{" "}
              page.
            </p>
          </Show>

          <div class="custom-exact-foot">
            <p>Sets {theme()} mode only. Switch modes to set the other separately.</p>
            <Show when={exact().accent || exact().page}>
              <button type="button" class="custom-reset" onClick={resetExact}>
                Reset
              </button>
            </Show>
          </div>
        </div>
      </details>
    </div>
  )
}
