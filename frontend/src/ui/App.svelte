<script lang="ts">
  import { onMount } from "svelte"
  import { session, view } from "../state/session.svelte"
  import { ensureTitle, titleOf } from "../state/titles.svelte"
  import { isTypingTarget } from "../app/domain"
  import Header from "./Header.svelte"
  import UrlBar from "./UrlBar.svelte"
  import Player from "./Player.svelte"
  import QueueList from "./QueueList.svelte"
  import ShortcutsPanel from "./ShortcutsPanel.svelte"

  let urlBar: UrlBar | undefined = $state()

  onMount(() => {
    session.start()
    return () => session.stop()
  })

  $effect(() => {
    const id = view.videoId
    if (!id) return
    ensureTitle(id)
    history.replaceState(null, "", `?v=${id}`)
    document.title = `${titleOf(id)} - Sameframe`
  })

  function onKeydown(e: KeyboardEvent) {
    if (isTypingTarget(e.target)) return
    if (e.key === "/") {
      e.preventDefault()
      urlBar?.focus()
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
      e.preventDefault()
      session.toggleFullscreen()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <Header />
  <UrlBar bind:this={urlBar} />
  <div class="main">
    <div class="video-col">
      <Player />
    </div>
    <QueueList />
  </div>
  <ShortcutsPanel />
</div>
