import { createSignal, Show } from "solid-js"
import { session } from "../state/session"
import { parseRoomCode } from "../app/domain"
import Icon from "./Icon"
import { shake } from "./motion"

export default function RoomTools() {
  const [joinCode, setJoinCode] = createSignal("")
  const [joinError, setJoinError] = createSignal(false)
  const [joinMsg, setJoinMsg] = createSignal("")
  const [createFailed, setCreateFailed] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
  let field: HTMLDivElement | undefined
  const ready = () => parseRoomCode(joinCode()) !== null

  async function doJoin() {
    const parsed = parseRoomCode(joinCode())
    try {
      if (!parsed) throw new Error("Enter a 6-character room code")
      setJoinError(false)
      await session.joinRoom(parsed)
    } catch (e) {
      setJoinMsg(e instanceof Error ? e.message : "Couldn't join")
      setJoinError(true)
      shake(field)
    }
  }

  async function doCreate() {
    setCreating(true)
    setCreateFailed(false)
    try {
      await session.createNewRoom()
    } catch {
      setCreateFailed(true)
      setCreating(false)
    }
  }

  return (
    <div class="room-tools">
      <div class={["join-field", { error: joinError() }]} ref={(el) => (field = el)}>
        <input
          class="join-input"
          placeholder="Room code"
          maxlength={6}
          autocapitalize="characters"
          autocorrect="off"
          spellcheck={false}
          aria-label="Join a room by code"
          aria-invalid={`${joinError()}`}
          value={joinCode()}
          onInput={(e) => {
            setJoinCode(e.currentTarget.value)
            setJoinError(false)
          }}
          onKeyDown={(e) => e.key === "Enter" && doJoin()}
        />
        <button class={["join-go", { ready: ready() }]} type="button" onClick={doJoin}>
          Join
        </button>
      </div>
      <Show when={joinError()}>
        <p class="join-msg" role="alert">
          {joinMsg()}
        </p>
      </Show>
      <button class="btn subtle block" type="button" disabled={creating()} onClick={doCreate}>
        <Icon name="plus" stroke={2} />
        {createFailed() ? "Couldn't create, try again" : "New room"}
      </button>
    </div>
  )
}
