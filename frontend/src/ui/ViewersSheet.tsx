import { For, Show } from "solid-js"
import { session, view } from "../state/session"
import CopyButton from "./CopyButton"
import Sheet from "./Sheet"

export default function ViewersSheet(props: { open: boolean; onclose: () => void; anchor?: HTMLElement }) {
  return (
    <Sheet open={props.open} onclose={props.onclose} anchor={props.anchor} label="Viewers">
      <section class="sheet-section">
        <span class="eyebrow">Watching</span>
        <ul class="viewers">
          <For each={view.viewers} keyed={(v) => v.id}>
            {(v) => (
              <li class="viewer">
                <span class="viewer-name">{v().label}</span>
                <Show when={v().isYou}>
                  <span class="viewer-tag">you</span>
                </Show>
                <Show when={v().isOwner}>
                  <span class="viewer-tag">owner</span>
                </Show>
                <Show when={!v().isYou}>
                  <button class="btn subtle" type="button" onClick={() => session.kick(v().id)}>
                    Remove
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="sheet-section">
        <span class="eyebrow">Owner link</span>
        <p class="viewers-note">Opens this room as owner on another device. Keep it private.</p>
        <CopyButton
          text={() => session.ownerLink()}
          label="Copy owner link"
          done="Owner link copied"
          title="Copy owner link"
          variant="subtle"
          block
        />
      </section>
    </Sheet>
  )
}
