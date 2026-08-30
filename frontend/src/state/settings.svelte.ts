/** Theme + music mode. Not sync domain (the server never sees them), so they
 *  stay out of the session. Side effects apply on change and at module init. */

export const settings = $state({
  theme:
    (localStorage.getItem("yt-theme") as "light" | "dark" | null) ??
    (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
  musicMode: localStorage.getItem("yt-music") === "1",
})

function applyTheme() {
  document.documentElement.setAttribute("data-theme", settings.theme)
}
function applyMusic() {
  document.body.classList.toggle("music", settings.musicMode)
}

applyTheme()
applyMusic()

export function toggleTheme() {
  settings.theme = settings.theme === "light" ? "dark" : "light"
  localStorage.setItem("yt-theme", settings.theme)
  applyTheme()
}

export function setMusicMode(on: boolean) {
  settings.musicMode = on
  localStorage.setItem("yt-music", on ? "1" : "0")
  applyMusic()
}
