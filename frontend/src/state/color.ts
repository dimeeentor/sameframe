/** sRGB <-> OKLCH and WCAG contrast, for the custom palette's exact colours. */
export type Rgb = [number, number, number]

// Constants: sRGB transfer (IEC 61966-2-1), OKLab matrices (Ottosson 2020), WCAG 2 luminance and contrast.

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function rgbToOklch([R, G, B]: Rgb) {
  const [r, g, b] = [R, G, B].map((v) => toLin(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { c: Math.hypot(A, Bb), h: ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360 }
}

export function oklchToRgb(L: number, C: number, H: number): Rgb {
  const h = (H * Math.PI) / 180
  const A = C * Math.cos(h)
  const Bb = C * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255)) as Rgb
}

const lum = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((v) => toLin(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: Rgb, b: Rgb) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

export const css = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`

/** Button text on an exact accent: white or near-black, whichever reads better.
 *  index.html repeats this for first paint. */
const DARK_INK: Rgb = [24, 16, 18]
export const inkFor = (bg: Rgb) =>
  css(contrast(bg, [255, 255, 255]) >= contrast(bg, DARK_INK) ? [255, 255, 255] : DARK_INK)
