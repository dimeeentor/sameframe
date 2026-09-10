<script lang="ts">
import { session, view } from "../state/session.svelte"

let dialog: HTMLDialogElement | undefined = $state()
let dismissed = $state(false)

$effect(() => {
  if (!dialog || dismissed) return
  if (!view.joined && !dialog.open) dialog.showModal()
  else if (view.joined && dialog.open) dialog.close()
})

const code = $derived(view.roomCode ?? session.roomCode)

function join() {
  session.join()
  dialog?.close()
}
</script>

<dialog bind:this={dialog} class="gate" oncancel={() => (dismissed = true)}>
  <div class="gate-glow" aria-hidden="true"></div>

  <div class="gate-body">
    {#if code}
      <span class="gate-label">Room</span>
      <h2 class="gate-code">{code}</h2>
    {/if}

    <p class="gate-greeting">
      Good to see you. Hit join and we'll start you off where everyone else is.
    </p>

    <button class="btn primary block gate-join" onclick={join}>
      Join room
    </button>
  </div>
</dialog>
