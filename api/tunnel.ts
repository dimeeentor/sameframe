import { PORT } from "./config.ts"
import { setPublicUrl } from "./state.ts"

export function getLocalIP(): string | null {
  try {
    const perm = (
      Deno as unknown as {
        permissions?: { querySync?: (desc: unknown) => { state: string } }
      }
    ).permissions
    if (perm?.querySync) {
      const s = perm.querySync({ name: "sys" } as unknown as never)
      if (s.state !== "granted") return null
    }
    const ifaces = (
      Deno as unknown as {
        networkInterfaces: () => Array<{ address: string; family: string }>
      }
    ).networkInterfaces?.()
    if (ifaces) {
      for (const i of ifaces) {
        if (
          i.family === "IPv4" &&
          !i.address.startsWith("127.") &&
          !i.address.startsWith("169.254.")
        ) {
          return i.address
        }
      }
    }
  } catch {}
  return null
}

async function startSshTunnel() {
  console.log(
    "\n🌐 starting public tunnel via localhost.run (ssh)...\n   share the URL that appears below\n",
  )
  const cmd = new Deno.Command("ssh", {
    args: [
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ServerAliveInterval=30",
      "-R",
      `80:localhost:${PORT}`,
      "nokey@localhost.run",
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  })
  const child = cmd.spawn()
  ;(async () => {
    const decoder = new TextDecoder()
    const reader = child.stdout.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      Deno.stdout.write(value)
      const m = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life\S*/)
      if (m) setPublicUrl(m[0])
    }
  })()
  ;(async () => {
    const reader = child.stderr.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      Deno.stderr.write(value)
      const m = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life\S*/)
      if (m) setPublicUrl(m[0])
    }
  })()
}

async function startLocaltunnel() {
  console.log("\n🌐 starting public tunnel via localtunnel (npx)...\n")
  const cmd = new Deno.Command("npx", {
    args: ["--yes", "localtunnel", "--port", String(PORT)],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  })
  const child = cmd.spawn()
  const decoder = new TextDecoder()
  ;(async () => {
    for await (const chunk of child.stdout) {
      const text = decoder.decode(chunk)
      Deno.stdout.write(chunk)
      const m = text.match(/https:\/\/[^\s]+\.loca\.lt/)
      if (m) setPublicUrl(m[0])
    }
  })()
  ;(async () => {
    for await (const chunk of child.stderr) Deno.stderr.write(chunk)
  })()
}

export async function startPublicTunnel() {
  try {
    const check = new Deno.Command("which", { args: ["ssh"] }).outputSync()
    if (check.success) {
      await startSshTunnel()
      return
    }
  } catch {}
  await startLocaltunnel()
}
