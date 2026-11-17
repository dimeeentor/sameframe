import { createSignal, Show } from "solid-js"
import { session } from "../state/session"
import { parseVideoId, thumb, type VideoId } from "../app/domain"
import Icon from "./Icon"
import { shake } from "./motion"

export default function UrlBar(props: { ondone?: () => void; inputRef?: (el: HTMLInputElement) => void }) {
  const [value, setValue] = createSignal("")
  const [invalid, setInvalid] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const [loadedThumb, setLoadedThumb] = createSignal<string | null>(null)
  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let input!: HTMLInputElement
  let root!: HTMLDivElement

  const candidate = () => parseVideoId(value())
  const preview = () => {
    const c = candidate()
    return c && loadedThumb() === c ? c : null
  }

  function reject() {
    setInvalid(true)
    shake(root)
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => setInvalid(false), 1200)
  }

  function submit(send: (id: VideoId) => void) {
    const id = parseVideoId(value())
    if (!id) return reject()
    send(id)
    setValue("")
    props.ondone?.()
  }
  const playNow = () => submit((id) => session.loadVideo(id))
  const addToQueue = () => submit((id) => session.addToQueue(id))

  return (
    <div class={["composer", { invalid: invalid(), "has-preview": !!preview() }]} ref={(el) => (root = el)}>
      <div class="composer-field">
        <span class="composer-lead" aria-hidden="true">
          <span class="composer-glyph">
            <Icon name="link" />
          </span>
          <Show when={candidate()}>
            {(c) => <img class="composer-thumb" src={thumb(c())} alt="" onLoad={() => setLoadedThumb(candidate())} />}
          </Show>
        </span>
        <input
          ref={(el) => {
            input = el
            props.inputRef?.(el)
          }}
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          type="text"
          inputmode="url"
          placeholder="Paste a YouTube link or video ID"
          spellcheck={false}
          autocomplete="off"
          aria-label="YouTube link"
          aria-invalid={`${invalid()}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addToQueue()
            if (e.key === "Escape") input.blur()
          }}
        />
        <Show when={!focused() && !value()}>
          <kbd class="composer-kbd" aria-hidden="true">
            /
          </kbd>
        </Show>
      </div>
      <div class="composer-actions">
        <button class="btn subtle" type="button" onClick={addToQueue}>
          <Icon name="plus" stroke={2} />
          Queue
        </button>
        <button class="btn primary" type="button" onClick={playNow}>
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7Z" />
          </svg>
          Play now
        </button>
      </div>
    </div>
  )
}
