import { createSignal, flush, Show } from "solid-js"
import { compact } from "../state/media"
import { resumeCode } from "../state/session"
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
      if (compact()) setAddOpen(true)
      flush() // open the sheet before focusing inside it
      urlInput?.focus()
    },
  })

  return (
    <>
      <section class="panel" aria-label="Queue">
        <Show when={!compact()}>
          <div class="panel-add" inert={!!resumeCode()}>
            <UrlBar inputRef={(el) => (urlInput = el)} />
            <Show when={resumeCode()}>
              <p class="panel-note">Choose a room first, then add videos.</p>
            </Show>
          </div>
        </Show>
        <QueueList />
      </section>

      <Show when={compact()}>
        <button
          class="fab"
          type="button"
          aria-label="Add a video"
          aria-expanded={`${addOpen()}`}
          disabled={!!resumeCode()}
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
