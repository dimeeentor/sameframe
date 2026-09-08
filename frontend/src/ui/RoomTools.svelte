<script lang="ts">
import { session } from "../state/session.svelte"
import { parseRoomCode } from "../app/domain"

type Props = { stacked?: boolean }
let { stacked = false }: Props = $props()

let joinCode = $state("")
let joinError = $state(false)

function doJoin() {
  const parsed = parseRoomCode(joinCode)
  if (!parsed) {
    joinError = true
    return
  }
  joinError = false
  session.joinRoom(parsed)
}
</script>

<div class="room-tools" class:stacked>
  <button
    class="btn tiny new-room"
    type="button"
    onclick={() => session.createNewRoom()}
  >
    New room
  </button>
  <div class="divider" aria-hidden="true"></div>
  <div class="join">
    <input
      class="join-input"
      class:error={joinError}
      placeholder="Room code"
      maxlength={6}
      autocapitalize="characters"
      autocorrect="off"
      spellcheck="false"
      aria-label="Join a room by code"
      bind:value={joinCode}
      oninput={() => (joinError = false)}
      onkeydown={(e) => e.key === "Enter" && doJoin()}
    />
    <button class="btn tiny" type="button" onclick={doJoin}>Join</button>
  </div>
</div>
