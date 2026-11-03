<script lang="ts">
import { contrast, css, oklchToRgb, rgbToOklch, type Rgb } from "../state/color"
import { saveCustom, settings } from "../state/settings.svelte"
import Icon from "./Icon.svelte"

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

const c = settings.custom
const mode = $derived(settings.theme)
const dark = $derived(mode === "dark")
const exact = $derived(c.exact[mode])

const step = $derived(exact.accent ? undefined : STEPS.find((s) => s.c === c.chroma))
const tintOf = (p: (typeof PAGES)[number]) => p.tint ?? c.hue
const isPage = (p: (typeof PAGES)[number]) => !exact.page && c.tint === tintOf(p) && c.k === p.k

/** What the theme paints right now: the exact colour, or the derived one. */
const accent = $derived<Rgb>(
  exact.accent ?? (dark ? oklchToRgb(0.74, c.chroma * 0.825, c.hue) : oklchToRgb(0.54, c.chroma, c.hue)),
)
const page = $derived<Rgb>(
  exact.page ?? (dark ? oklchToRgb(0.161, 0.009 * c.k, c.tint) : oklchToRgb(0.961, 0.013 * c.k, c.tint)),
)
/** Body text on the page, same formula as --ink. */
const ink = $derived(dark ? oklchToRgb(0.96, 0.008 * c.k, c.tint) : oklchToRgb(0.2, 0.008 * c.k, c.tint))
const textContrast = $derived(contrast(page, ink))
/** Accent marks (progress, focus, links) need 3:1 against the page. */
const accentContrast = $derived(contrast(accent, page))

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function clearExact(which: "accent" | "page") {
  c.exact.light[which] = c.exact.dark[which] = null
}

/** A page matched to the accent keeps following it, unless it has an exact colour. */
function moveHue(h: number) {
  if (c.tint === c.hue && !c.exact.light.page && !c.exact.dark.page) c.tint = h
  c.hue = h
}

function setHue(e: Event & { currentTarget: HTMLInputElement }) {
  moveHue(e.currentTarget.valueAsNumber)
  clearExact("accent")
}

function pickStep(chroma: number) {
  c.chroma = chroma
  clearExact("accent")
  saveCustom()
}

function pickPage(p: (typeof PAGES)[number]) {
  c.tint = tintOf(p)
  c.k = p.k
  clearExact("page")
  saveCustom()
}

function setChannel(which: "accent" | "page", i: number, e: Event & { currentTarget: HTMLInputElement }) {
  const v = e.currentTarget.valueAsNumber
  if (!Number.isFinite(v)) return
  const rgb = [...(which === "accent" ? accent : page)] as Rgb
  rgb[i] = clamp(Math.round(v), 0, 255)
  c.exact[mode][which] = rgb

  // Keep the simple controls, and the other mode's derived colour, in step.
  const o = rgbToOklch(rgb)
  if (which === "accent") {
    if (o.c > 0.01) moveHue(Math.round(o.h))
    c.chroma = Math.round(clamp(dark ? o.c / 0.825 : o.c, 0, 0.25) * 1000) / 1000
  } else {
    if (o.c > 0.003) c.tint = Math.round(o.h)
    c.k = Math.round(clamp(o.c / (dark ? 0.009 : 0.013), 0, 3) * 20) / 20
  }
  saveCustom()
}

function resetExact() {
  c.exact[mode].accent = c.exact[mode].page = null
  saveCustom()
}
</script>

<div class="palette-custom">
  <label class="palette-slider">
    <span>Accent</span>
    <input type="range" class="hue-range" min="0" max="360" value={c.hue} oninput={setHue} onchange={saveCustom} />
  </label>

  <div class="custom-group">
    <span class="custom-label"><span>Intensity</span><span class="custom-picked">{step?.name}</span></span>
    <div class="custom-steps" role="radiogroup" aria-label="Intensity">
      {#each STEPS as s (s.c)}
        <button
          type="button"
          role="radio"
          class="custom-step"
          aria-checked={step === s}
          aria-label={s.name}
          title={s.name}
          style:--c={s.c}
          onclick={() => pickStep(s.c)}
        ></button>
      {/each}
    </div>
  </div>

  <div class="custom-group" role="radiogroup" aria-label="Page">
    <span class="custom-label">Page</span>
    <div class="custom-pages">
      {#each PAGES as p (p.label)}
        <button type="button" role="radio" class="custom-page" aria-checked={isPage(p)} onclick={() => pickPage(p)}>
          <span class="custom-tile" style:--tint={tintOf(p)} style:--tint-k={p.k}></span>
          {p.label}
        </button>
      {/each}
    </div>
  </div>

  <details class="custom-exact">
    <summary>
      <span>Exact colours</span>
      <Icon name="chevron" stroke={2} />
    </summary>
    <div class="custom-exact-body">
      {#each [{ id: "accent", label: "Accent", rgb: accent }, { id: "page", label: "Page", rgb: page }] as const as row (row.id)}
        <div class="custom-rgb" role="group" aria-label="{row.label} colour">
          <span class="custom-swatch" style:background={css(row.rgb)}></span>
          <span>{row.label}</span>
          {#each CHANNELS as ch, i (ch.ch)}
            <label class="custom-channel">
              <span aria-hidden="true">{ch.ch}</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                max="255"
                aria-label="{row.label} {ch.name}"
                value={row.rgb[i]}
                oninput={(e) => setChannel(row.id, i, e)}
              />
            </label>
          {/each}
        </div>
      {/each}

      {#if textContrast < 4.5}
        <p class="custom-warn">
          Text on this page is hard to read ({textContrast.toFixed(1)}:1). Try a {dark ? "darker" : "lighter"} page.
        </p>
      {:else if accentContrast < 3}
        <p class="custom-warn">
          The accent is hard to see on this page ({accentContrast.toFixed(1)}:1). Try a {dark ? "lighter" : "darker"} accent.
        </p>
      {/if}

      <div class="custom-exact-foot">
        <p>Sets {mode} mode only. Switch modes to set the other separately.</p>
        {#if exact.accent || exact.page}
          <button type="button" class="custom-reset" onclick={resetExact}>Reset</button>
        {/if}
      </div>
    </div>
  </details>
</div>
