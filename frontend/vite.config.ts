import { defineConfig, lazyPlugins } from "vite-plus"
import solid from "@solidjs/vite-plugin"

export default defineConfig({
  plugins: lazyPlugins(() => [solid()]),
  server: {
    // allow serving the shared protocol module that lives above frontend/
    fs: { allow: [".."] },
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
})
