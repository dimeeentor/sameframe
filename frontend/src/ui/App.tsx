import { createEffect, createSignal, Match, Switch } from "solid-js"
import { notFoundCode, session, view } from "../state/session"
import { ensureTitle, titleOf } from "../state/titles"
import { isTypingTarget } from "../app/domain"
import Header from "./Header"
import Player from "./Player"
import Panel, { type PanelApi } from "./Panel"

export default function App() {
  let panel: PanelApi | undefined
  const [stageHeight, setStageHeight] = createSignal(0)

  // fetch titles for the current and every queued video
  createEffect(
    () => [view.videoId, ...view.queue],
    (ids) => ids.forEach((id) => id && ensureTitle(id)),
  )

  createEffect(
    () => (view.videoId ? `${titleOf(view.videoId)} - Sameframe` : "Sameframe"),
    (title) => void (document.title = title),
  )

  function onKeydown(e: KeyboardEvent) {
    if (isTypingTarget(e.target)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const el = e.target instanceof Element ? e.target : null
    if (el?.closest("dialog, [role=dialog]")) return
    if (e.key === " " && el?.closest("button, a")) return
    if (e.key === "/") {
      e.preventDefault()
      panel?.focusLink()
    } else if (e.key === " ") {
      e.preventDefault()
      session.togglePlay()
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      session.seekBy(-5)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      session.seekBy(5)
    } else if (e.key.toLowerCase() === "f") {
      if (!view.videoId) return
      e.preventDefault()
      session.toggleFullscreen()
    }
  }
  // App lives for the whole page, so the listener never needs removing
  window.addEventListener("keydown", onKeydown)

  return (
    <div class="app">
      <Header />
      <main
        class={["main", { centered: !!notFoundCode() }]}
        style={{ "--stage-h": stageHeight() ? `${stageHeight()}px` : undefined }}
      >
        <Switch
          fallback={
            <>
              <Player onheight={setStageHeight} />
              <Panel api={(api) => (panel = api)} />
            </>
          }
        >
          <Match when={notFoundCode()}>
            <div class="kicked">
              <h2 class="kicked-title">Room not found</h2>
              <p class="kicked-note">
                There's no room {notFoundCode()}. It may have expired, or the code is mistyped.
              </p>
              <button class="btn primary large" type="button" onClick={() => session.createNewRoom()}>
                New room
              </button>
            </div>
          </Match>
          <Match when={view.kicked}>
            <div class="kicked">
              <h2 class="kicked-title">You left the room</h2>
              <p class="kicked-note">The video stopped so this device can sleep.</p>
              <button class="btn primary large" type="button" onClick={() => session.rejoin()}>
                Rejoin
              </button>
            </div>
          </Match>
        </Switch>
      </main>
    </div>
  )
}
