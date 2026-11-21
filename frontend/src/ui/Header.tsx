import { createSignal, Show } from "solid-js"
import { notFoundCode, view } from "../state/session"
import { compact } from "../state/media"
import CopyButton from "./CopyButton"
import RoomTools from "./RoomTools"
import Sheet from "./Sheet"
import ViewersSheet from "./ViewersSheet"
import PaletteSwitch from "./PaletteSwitch"
import ThemeSwitch from "./ThemeSwitch"
import { replayOn, rise } from "./motion"

function PresenceBody() {
  const connText = () =>
    view.connection === "open"
      ? "Live"
      : view.connection === "polling"
        ? "Polling"
        : view.connection === "connecting"
          ? "Connecting"
          : "Reconnecting"
  return (
    <>
      <span class="presence-dot" aria-hidden="true"></span>
      <span class="presence-conn">
        <span aria-hidden="true">Connecting</span>
        <span class="shown">{connText()}</span>
      </span>
      <span class="presence-sep" aria-hidden="true"></span>
      <span class="presence-count">
        <span
          class="presence-num"
          ref={replayOn(() => view.viewerCount, (el) => rise(el, { y: 6, blur: 2, duration: 240 }))}
        >
          {view.viewerCount}
        </span>
        <span class="presence-label">watching</span>
      </span>
    </>
  )
}

export default function Header() {
  const [menuOpen, setMenuOpen] = createSignal(false)
  const [viewersOpen, setViewersOpen] = createSignal(false)
  const [menuTouched, setMenuTouched] = createSignal(false)
  // plain refs: each trigger renders before the sheet that reads it as an anchor
  let menuBtn: HTMLButtonElement | undefined
  let viewersBtn: HTMLButtonElement | undefined

  return (
    <>
      <header class={["topbar", { bare: !!notFoundCode() }]}>
        <span class="wordmark">
          Same<em>frame</em>
        </span>

        <Show when={!notFoundCode()}>
          <Show
            when={view.isOwner}
            fallback={
              <div class="presence" data-conn={view.connection} title="Connection status and viewers">
                <PresenceBody />
              </div>
            }
          >
            <button
              ref={(el) => (viewersBtn = el)}
              class="presence presence-btn"
              type="button"
              data-conn={view.connection}
              title="Manage viewers"
              aria-label="Manage viewers"
              onClick={() => setViewersOpen(true)}
            >
              <PresenceBody />
            </button>
          </Show>

          <div class="topbar-actions">
            <Show when={!compact()}>
              <span class="room-chip" title="Room code">
                <span class="room-chip-label">Room</span>
                {view.roomCode ?? "······"}
              </span>
              <CopyButton text={() => view.shareUrl} label="Invite" done="Link copied" title="Copy invite link" />
            </Show>
            <button
              ref={(el) => (menuBtn = el)}
              class="icon-btn"
              type="button"
              aria-label="Room and settings"
              aria-expanded={`${menuOpen()}`}
              onClick={() => {
                setMenuOpen(true)
                setMenuTouched(true)
              }}
            >
              <svg
                class="burger"
                data-open={String(menuOpen())}
                data-touched={String(menuTouched())}
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
              >
                <g class="lane a">
                  <rect x="4" y="7" width="16" height="2" rx="1" />
                </g>
                <g class="lane b">
                  <rect x="4" y="15" width="16" height="2" rx="1" />
                </g>
              </svg>
            </button>
          </div>
        </Show>
      </header>

      <Sheet open={menuOpen()} onclose={() => setMenuOpen(false)} anchor={menuBtn} label="Room and settings">
        <Show when={compact()}>
          <section class="sheet-section room-card">
            <span class="eyebrow">You're in room</span>
            <span class="room-card-code">{view.roomCode ?? "······"}</span>
            <CopyButton
              text={() => view.shareUrl}
              label="Copy invite link"
              done="Link copied"
              title="Copy invite link"
              block
            />
          </section>
        </Show>

        <section class="sheet-section">
          <span class="eyebrow">Appearance</span>
          <ThemeSwitch />
          <PaletteSwitch />
        </section>

        <section class="sheet-section">
          <span class="eyebrow">Another room</span>
          <RoomTools />
        </section>
      </Sheet>

      <Show when={view.isOwner}>
        <ViewersSheet open={viewersOpen()} onclose={() => setViewersOpen(false)} anchor={viewersBtn} />
      </Show>
    </>
  )
}
