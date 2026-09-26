<script lang="ts">
import { session } from "../state/session.svelte"
import { parseRoomCode } from "../app/domain"
import Icon from "./Icon.svelte"
import { shake } from "./motion"

type Props = { stacked?: boolean }
let { stacked = false }: Props = $props()

let joinCode = $state("")
let joinError = $state(false)
let field: HTMLDivElement | undefined = $state()

function doJoin() {
  const parsed = parseRoomCode(joinCode)
  if (!parsed) {
    joinError = true
    shake(field)
    return
  }
  joinError = false
  session.joinRoom(parsed)
}
</script>

<div class="room-tools" class:stacked>
  <div class="join-field" class:error={joinError} bind:this={field}>
    <input
      class="join-input"
      placeholder="Room code"
      maxlength={6}
      autocapitalize="characters"
      autocorrect="off"
      spellcheck="false"
      aria-label="Join a room by code"
      aria-invalid={joinError}
      bind:value={joinCode}
      oninput={() => (joinError = false)}
      onkeydown={(e) => e.key === "Enter" && doJoin()}
    />
    <button class="join-go" type="button" aria-label="Join room" title="Join room" onclick={doJoin}>
      <Icon name="arrow" stroke={2} />
    </button>
  </div>
  <button
    class="btn subtle new-room"
    class:block={stacked}
    type="button"
    onclick={() => session.createNewRoom()}
  >
    <Icon name="plus" stroke={2} />
    New room
  </button>
</div>
