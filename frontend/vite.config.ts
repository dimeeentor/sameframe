import { defineConfig, lazyPlugins } from "vite-plus"
import { svelte } from "@sveltejs/vite-plugin-svelte"

export default defineConfig({
  plugins: lazyPlugins(() => [svelte()]),
  server: {
    // allow serving the shared protocol module that lives above frontend/
    fs: { allow: [".."] },
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
})
