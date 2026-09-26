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
  <div class="ticket">
    <div class="ticket-main">
      <div class="ticket-meta">
        <span>Admit one</span>
        <span>Sameframe</span>
      </div>
      <h2 class="gate-title">You're invited to <em>a screening</em></h2>
      <p class="gate-greeting">
        Good to see you. Hit join and we'll start you off where everyone else is.
      </p>
    </div>

    <div class="ticket-stub">
      {#if code}
        <span class="eyebrow">Room</span>
        <div class="gate-code" aria-label="Room {code}">
          {#each code.split("") as ch, i (i)}
            <span style="--i: {i}">{ch}</span>
          {/each}
        </div>
      {/if}
      <button class="btn primary large block gate-join" type="button" onclick={join}>
        Join room
      </button>
    </div>
  </div>
</dialog>
