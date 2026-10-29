<script lang="ts">
import { session } from "../state/session.svelte"
import { parseRoomCode } from "../app/domain"
import Icon from "./Icon.svelte"
import { shake } from "./motion"

let joinCode = $state("")
let joinError = $state(false)
let joinMsg = $state("")
let createFailed = $state(false)
let creating = $state(false)
let field: HTMLDivElement | undefined

async function doJoin() {
  const parsed = parseRoomCode(joinCode)
  try {
    if (!parsed) throw new Error("Enter a 6-character room code")
    joinError = false
    await session.joinRoom(parsed)
  } catch (e) {
    joinMsg = e instanceof Error ? e.message : "Couldn't join"
    joinError = true
    shake(field)
  }
}

async function doCreate() {
  creating = true
  createFailed = false
  try {
    await session.createNewRoom()
  } catch {
    createFailed = true
    creating = false
  }
}
</script>

<div class="room-tools">
  <div class={["join-field", { error: joinError }]} bind:this={field}>
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
  {#if joinError}
    <p class="join-msg" role="alert">{joinMsg}</p>
  {/if}
  <button
    class="btn subtle block"
    type="button"
    disabled={creating}
    onclick={doCreate}
  >
    <Icon name="plus" stroke={2} />
    {createFailed ? "Couldn't create, try again" : "New room"}
  </button>
</div>
