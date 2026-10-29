import { mount } from "svelte"
import "./styles/fonts.css"
import "./app.css"
import App from "./ui/App.svelte"

const fonts = [
  '1em "Geist Variable"',
  '1em "Geist Mono Variable"',
  '1em "Instrument Serif"',
  'italic 1em "Instrument Serif"',
].map((f) => document.fonts.load(f))
void Promise.race([
  Promise.allSettled(fonts),
  new Promise((r) => setTimeout(r, 1500)),
]).then(() => {
  const target = document.getElementById("app")
  if (target) mount(App, { target })
})
