import { For, Show } from "solid-js"
import { PALETTES, setPalette, settings } from "../state/settings"
import CustomTheme from "./CustomTheme"
import Icon from "./Icon"

export default function PaletteSwitch() {
  const current = () => PALETTES.find((p) => p.id === settings.palette)
  return (
    <details class="palette">
      <summary class="palette-summary" data-palette={settings.palette}>
        <span class="palette-swatch"></span>
        <span class="palette-name">{current()?.label}</span>
        <Icon name="chevron" stroke={2} />
      </summary>
      <div class="palette-switch" role="group" aria-label="Colour">
        <For each={PALETTES}>
          {(p) => (
            <button
              type="button"
              class="palette-btn"
              data-palette={p.id}
              aria-pressed={`${settings.palette === p.id}`}
              aria-label={p.label}
              title={p.label}
              onClick={() => setPalette(p.id)}
            >
              <span class="palette-swatch"></span>
            </button>
          )}
        </For>
      </div>
      <Show when={settings.palette === "custom"}>
        <CustomTheme />
      </Show>
    </details>
  )
}
