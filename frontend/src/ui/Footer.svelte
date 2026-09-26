<script lang="ts">
import RoomTools from "./RoomTools.svelte"
</script>

<footer class="footer">
  <dl class="shortcuts">
    <div><dt><kbd>/</kbd></dt><dd>Link field</dd></div>
    <div><dt><kbd>Space</kbd></dt><dd>Play / pause</dd></div>
    <div><dt><kbd>&larr;</kbd><kbd>&rarr;</kbd></dt><dd>Seek 5s</dd></div>
    <div><dt><kbd>F</kbd></dt><dd>Fullscreen</dd></div>
    <div><dt><kbd>Esc</kbd></dt><dd>Blur</dd></div>
  </dl>
  <RoomTools />
</footer>
