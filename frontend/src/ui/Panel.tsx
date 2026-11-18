import { createSignal, flush, Show } from "solid-js"
import { layout } from "../state/media"
import { resume } from "../state/session"
import Icon from "./Icon"
import QueueList from "./QueueList"
import Sheet from "./Sheet"
import UrlBar from "./UrlBar"

export type PanelApi = { focusLink: () => void }

export default function Panel(props: { api?: (api: PanelApi) => void }) {
  const [addOpen, setAddOpen] = createSignal(false)
  let urlInput: HTMLInputElement | undefined

  props.api?.({
    focusLink() {
      if (layout.compact) setAddOpen(true)
      flush() // open the sheet before focusing inside it
      urlInput?.focus()
    },
  })

  return (
    <>
      <section class="panel" aria-label="Queue">
        <Show when={!layout.compact}>
          <div class="panel-add" inert={!!resume.code}>
            <UrlBar inputRef={(el) => (urlInput = el)} />
            <Show when={resume.code}>
              <p class="panel-note">Choose a room first, then add videos.</p>
            </Show>
          </div>
        </Show>
        <QueueList />
      </section>

      <Show when={layout.compact}>
        <button
          class="fab"
          type="button"
          aria-label="Add a video"
          aria-expanded={`${addOpen()}`}
          disabled={!!resume.code}
          onClick={() => setAddOpen(true)}
        >
          <Icon name="plus" stroke={2.2} />
        </button>
        <Sheet open={addOpen()} onclose={() => setAddOpen(false)} label="Add a video">
          <UrlBar inputRef={(el) => (urlInput = el)} ondone={() => setAddOpen(false)} />
        </Sheet>
      </Show>
    </>
  )
}
