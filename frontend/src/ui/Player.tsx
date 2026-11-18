import { Match, onCleanup, Show, Switch } from "solid-js"
import { chooseResume, resume, session, view } from "../state/session"
import { titleOf } from "../state/titles"
import Icon from "./Icon"
import { Transition } from "./Transition"
import { fade, replayOn, swap } from "./motion"

const pad = (n: number) => String(n).padStart(2, "0")

export default function Player(props: { onheight?: (px: number) => void }) {
  const gateHint = () =>
    view.videoId
      ? `${titleOf(view.videoId)} is already playing. Join to pick it up in sync.`
      : "Join the room, then paste a YouTube link to start."

  function observe(el: HTMLElement) {
    const ro = new ResizeObserver(() => props.onheight?.(el.clientHeight))
    ro.observe(el)
    onCleanup(() => ro.disconnect())
  }

  return (
    <div class={["stage", { playing: view.isPlaying && !!view.videoId }]} ref={observe}>
      <div class="frame">
        <div class={["player-wrap", { dimmed: !view.joined }]}>
          <div ref={(el) => session.attachPlayer(el)} id="player"></div>

          {/* one persistent placeholder so the leader keeps sweeping while only the copy swaps */}
          <Transition enter={(el) => fade(el, { duration: 200 })} exit={(el) => fade(el, { duration: 260, out: true })}>
            <Show when={!view.joined || !view.videoId}>
              <div class="placeholder">
                <div class="leader" aria-hidden="true">
                  <span class="leader-sweep"></span>
                  <span class="leader-ring"></span>
                  <span class="leader-ring inner"></span>
                  <span class="leader-cross"></span>
                </div>
                <div class="placeholder-inner" ref={(el) => replayOn(el, () => (resume.code ? "resume" : view.joined), swap)}>
                  <Switch>
                    <Match when={resume.code}>
                      <h2>Pick up where you left off?</h2>
                      <p>
                        Room <span class="resume-code">{resume.code}</span> is still open.
                      </p>
                      <div class="resume-actions">
                        <button class="btn primary large" type="button" onClick={() => chooseResume(true)}>
                          Continue
                        </button>
                        <button class="btn subtle large" type="button" onClick={() => chooseResume(false)}>
                          Start fresh
                        </button>
                      </div>
                    </Match>
                    <Match when={!view.joined}>
                      <h2>Watch together</h2>
                      <p>{gateHint()}</p>
                      <button class="btn primary large" type="button" onClick={() => session.join()}>
                        Join room
                      </button>
                    </Match>
                    <Match when={true}>
                      <h2>Nothing on screen yet</h2>
                      <p>Paste a YouTube link to start the show.</p>
                    </Match>
                  </Switch>
                </div>
              </div>
            </Show>
          </Transition>
        </div>
      </div>

      <Transition enter={(el) => fade(el, { duration: 160 })} exit={(el) => fade(el, { duration: 160, out: true })}>
        <Show when={view.videoId}>
          {(id) => (
            <div class="now">
              <span class="now-state" title={view.isPlaying ? "Playing" : "Paused"}>
                <Show when={view.isPlaying} fallback={<Icon name="pause" stroke={2.4} />}>
                  <span class="bars" aria-hidden="true">
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                </Show>
              </span>
              <span class="now-title-cell">
                <span class="now-title" ref={(el) => replayOn(el, id, swap)}>
                  {titleOf(id())}
                </span>
              </span>
              <Show when={view.queueIndex >= 0}>
                <span class="now-pos" aria-label={`Video ${view.queueIndex + 1} of ${view.queue.length}`}>
                  {pad(view.queueIndex + 1)}
                  <i>/</i>
                  {pad(view.queue.length)}
                </span>
              </Show>
            </div>
          )}
        </Show>
      </Transition>
    </div>
  )
}
