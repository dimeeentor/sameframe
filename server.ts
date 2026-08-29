const PORT = 8000;
const PUBLIC = Deno.args.includes("--public") || Deno.args.includes("--share");

type SyncState = {
  videoId: string | null;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  updatedAt: number;
  queue: string[];
  queueIndex: number;
};

let state: SyncState = {
  videoId: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  updatedAt: Date.now(),
  queue: [],
  queueIndex: -1,
};

let publicUrl: string | null = null;
const clients = new Set<WebSocket>();

function estimatedTime(): number {
  if (!state.isPlaying || state.videoId === null) return state.currentTime;
  const elapsed = ((Date.now() - state.updatedAt) / 1000) * state.playbackRate;
  return state.currentTime + elapsed;
}

function getSyncPayload() {
  return {
    type: "sync",
    videoId: state.videoId,
    currentTime: estimatedTime(),
    isPlaying: state.isPlaying,
    playbackRate: state.playbackRate,
    updatedAt: Date.now(),
    queue: state.queue,
    queueIndex: state.queueIndex,
    publicUrl,
  };
}

function broadcast(msg: unknown, exclude?: WebSocket) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN && ws !== exclude) {
      ws.send(data);
    }
  }
}

const ROOT = new URL(".", import.meta.url).pathname;

async function serveFile(path: string, contentType: string): Promise<Response> {
  try {
    const data = await Deno.readFile(ROOT + path);
    return new Response(data, { headers: { "content-type": contentType } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function getLocalIP(): string | null {
  try {
    const perm = (
      Deno as unknown as {
        permissions?: { querySync?: (desc: unknown) => { state: string } };
      }
    ).permissions;
    if (perm?.querySync) {
      const s = perm.querySync({ name: "sys" } as unknown as never);
      if (s.state !== "granted") return null;
    }
    const ifaces = (
      Deno as unknown as {
        networkInterfaces: () => Array<{ address: string; family: string }>;
      }
    ).networkInterfaces?.();
    if (ifaces) {
      for (const i of ifaces) {
        if (
          i.family === "IPv4" &&
          !i.address.startsWith("127.") &&
          !i.address.startsWith("169.254.")
        ) {
          return i.address;
        }
      }
    }
  } catch {}
  return null;
}

function setPublicUrl(url: string) {
  publicUrl = url.replace(/\/$/, "");
  console.log(
    `\n✨ PUBLIC URL: ${publicUrl}  → share with anyone!\n   (Share button will now copy this)\n`,
  );

  broadcast({ type: "public_url", url: publicUrl });
}

async function startPublicTunnel() {
  const trySsh = async () => {
    console.log(
      "\n🌐 starting public tunnel via localhost.run (ssh)...\n   share the URL that appears below\n",
    );
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
    });
    const child = cmd.spawn();

    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        Deno.stdout.write(value);
        const m = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life\S*/);
        if (m) setPublicUrl(m[0]);
      }
    })();
    (async () => {
      const reader = child.stderr.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        Deno.stderr.write(value);
        const m = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life\S*/);
        if (m) setPublicUrl(m[0]);
      }
    })();
  };

  const tryLocaltunnel = async () => {
    console.log("\n🌐 starting public tunnel via localtunnel (npx)...\n");
    const cmd = new Deno.Command("npx", {
      args: ["--yes", "localtunnel", "--port", String(PORT)],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    });
    const child = cmd.spawn();
    const decoder = new TextDecoder();
    (async () => {
      for await (const chunk of child.stdout) {
        const text = decoder.decode(chunk);
        Deno.stdout.write(chunk);
        const m = text.match(/https:\/\/[^\s]+\.loca\.lt/);
        if (m) setPublicUrl(m[0]);
      }
    })();
    (async () => {
      for await (const chunk of child.stderr) Deno.stderr.write(chunk);
    })();
  };

  try {
    const check = new Deno.Command("which", { args: ["ssh"] }).outputSync();
    if (check.success) {
      await trySsh();
      return;
    }
  } catch {}
  await tryLocaltunnel();
}

function setVideo(videoId: string, broadcastToAll = true) {
  let idx = state.queue.indexOf(videoId);
  if (idx === -1) {
    state.queue.push(videoId);
    idx = state.queue.length - 1;
  }
  state.queueIndex = idx;
  state.videoId = videoId;
  state.currentTime = 0;
  state.isPlaying = true;
  state.updatedAt = Date.now();
  if (broadcastToAll) {
    broadcast({
      type: "load",
      videoId,
      currentTime: 0,
      isPlaying: true,
      queue: state.queue,
      queueIndex: state.queueIndex,
    });
  }
}

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/ws") {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      clients.add(socket);
      console.log(`client connected (${clients.size})`);
      socket.send(JSON.stringify(getSyncPayload()));
      if (publicUrl) {
        socket.send(JSON.stringify({ type: "public_url", url: publicUrl }));
      }
      broadcast({ type: "clients", count: clients.size });
    };

    socket.onclose = () => {
      clients.delete(socket);
      console.log(`client disconnected (${clients.size})`);
      broadcast({ type: "clients", count: clients.size });
    };

    socket.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "load": {
            if (typeof msg.videoId === "string" && msg.videoId.length === 11) {
              setVideo(msg.videoId, true);
            }
            break;
          }
          case "queue_add": {
            if (typeof msg.videoId === "string" && msg.videoId.length === 11) {
              if (!state.queue.includes(msg.videoId)) {
                state.queue.push(msg.videoId);
                broadcast({
                  type: "queue",
                  queue: state.queue,
                  queueIndex: state.queueIndex,
                });
              }

              if (!state.videoId) {
                setVideo(msg.videoId, true);
              }
            }
            break;
          }
          case "queue_next": {
            if (state.queue.length > 0) {
              const next = (state.queueIndex + 1) % state.queue.length;
              state.queueIndex = next;
              state.videoId = state.queue[next];
              state.currentTime = 0;
              state.isPlaying = true;
              state.updatedAt = Date.now();
              broadcast({
                type: "load",
                videoId: state.videoId,
                currentTime: 0,
                isPlaying: true,
                queue: state.queue,
                queueIndex: next,
              });
            }
            break;
          }
          case "queue_prev": {
            if (state.queue.length > 0) {
              const prev = (state.queueIndex - 1 + state.queue.length) %
                state.queue.length;
              state.queueIndex = prev;
              state.videoId = state.queue[prev];
              state.currentTime = 0;
              state.isPlaying = true;
              state.updatedAt = Date.now();
              broadcast({
                type: "load",
                videoId: state.videoId,
                currentTime: 0,
                isPlaying: true,
                queue: state.queue,
                queueIndex: prev,
              });
            }
            break;
          }
          case "queue_remove": {
            const idx = typeof msg.index === "number"
              ? msg.index
              : state.queue.indexOf(msg.videoId);
            if (idx >= 0 && idx < state.queue.length) {
              state.queue.splice(idx, 1);
              if (state.queueIndex >= state.queue.length) {
                state.queueIndex = state.queue.length - 1;
              }
              if (state.queueIndex === idx && state.queue.length > 0) {
                const newId = state.queue[state.queueIndex] ?? state.queue[0];
                if (newId) {
                  state.videoId = newId;
                  state.currentTime = 0;
                  state.isPlaying = true;
                  state.updatedAt = Date.now();
                  broadcast({
                    type: "load",
                    videoId: newId,
                    currentTime: 0,
                    isPlaying: true,
                    queue: state.queue,
                    queueIndex: state.queueIndex,
                  });
                  break;
                }
              }
              broadcast({
                type: "queue",
                queue: state.queue,
                queueIndex: state.queueIndex,
              });
              if (state.queue.length === 0) {
                state.videoId = null;
                state.queueIndex = -1;
              }
            }
            break;
          }
          case "queue_clear": {
            state.queue = [];
            state.queueIndex = -1;
            broadcast({ type: "queue", queue: state.queue, queueIndex: -1 });
            break;
          }
          case "play": {
            state.currentTime = typeof msg.currentTime === "number"
              ? msg.currentTime
              : estimatedTime();
            state.isPlaying = true;
            state.updatedAt = Date.now();
            broadcast({ type: "play", currentTime: state.currentTime }, socket);
            break;
          }
          case "pause": {
            state.currentTime = typeof msg.currentTime === "number"
              ? msg.currentTime
              : estimatedTime();
            state.isPlaying = false;
            state.updatedAt = Date.now();
            broadcast(
              { type: "pause", currentTime: state.currentTime },
              socket,
            );
            break;
          }
          case "seek": {
            state.currentTime = typeof msg.currentTime === "number"
              ? msg.currentTime
              : 0;
            state.updatedAt = Date.now();
            broadcast({ type: "seek", currentTime: state.currentTime }, socket);
            break;
          }
          case "ended": {
            if (
              state.queue.length > 0 &&
              state.queueIndex < state.queue.length - 1
            ) {
              const next = state.queueIndex + 1;
              state.queueIndex = next;
              state.videoId = state.queue[next];
              state.currentTime = 0;
              state.isPlaying = true;
              state.updatedAt = Date.now();
              broadcast({
                type: "load",
                videoId: state.videoId,
                currentTime: 0,
                isPlaying: true,
                queue: state.queue,
                queueIndex: next,
              });
            } else if (
              state.queue.length > 1 &&
              state.queueIndex === state.queue.length - 1
            ) {
              state.queueIndex = 0;
              state.videoId = state.queue[0];
              state.currentTime = 0;
              state.isPlaying = true;
              state.updatedAt = Date.now();
              broadcast({
                type: "load",
                videoId: state.videoId,
                currentTime: 0,
                isPlaying: true,
                queue: state.queue,
                queueIndex: 0,
              });
            }
            break;
          }
          case "rate": {
            state.playbackRate = typeof msg.playbackRate === "number"
              ? msg.playbackRate
              : 1;
            broadcast(
              { type: "rate", playbackRate: state.playbackRate },
              socket,
            );
            break;
          }
          case "sync_request": {
            socket.send(JSON.stringify(getSyncPayload()));
            break;
          }
        }
      } catch (err) {
        console.error("ws message error", err);
      }
    };

    socket.onerror = (e: Event | ErrorEvent) => console.error("ws error", e);
    return response;
  }

  if (url.pathname === "/api/public-url") {
    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { "content-type": "application/json" },
    });
  }
  if (url.pathname === "/api/sync") {
    return new Response(JSON.stringify(getSyncPayload()), {
      headers: { "content-type": "application/json" },
    });
  }
  if (url.pathname.startsWith("/api/title")) {
    const id = url.searchParams.get("id") || url.searchParams.get("v");
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return new Response(JSON.stringify({ error: "invalid id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
        { headers: { "User-Agent": "Sameframe/1.0" } },
      );
      if (!r.ok) {
        return new Response(JSON.stringify({ id, title: id }), {
          headers: { "content-type": "application/json" },
        });
      }
      const j = (await r.json()) as { title?: string; author_name?: string };
      return new Response(
        JSON.stringify({
          id,
          title: j.title ?? id,
          author: j.author_name ?? "",
        }),
        {
          headers: {
            "content-type": "application/json",
            "Cache-Control": "public, max-age=86400",
          },
        },
      );
    } catch {
      return new Response(JSON.stringify({ id, title: id }), {
        headers: { "content-type": "application/json" },
      });
    }
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return await serveFile("public/index.html", "text/html");
  }
  if (url.pathname === "/app.js") {
    return await serveFile("public/app.js", "application/javascript");
  }
  if (url.pathname === "/style.css") {
    return await serveFile("public/style.css", "text/css");
  }
  if (url.pathname === "/favicon.ico") {
    return new Response(null, { status: 204 });
  }
  return new Response("Not found", { status: 404 });
});

const localIP = getLocalIP();
console.log(`\nSameframe running`);
console.log(`  local:   http://localhost:${PORT}`);
if (localIP) {
  console.log(`  network: http://${localIP}:${PORT}  ← share on same Wi-Fi`);
  console.log(`           (your Mac is host — keep this terminal open)`);
}
console.log(`  open 2 tabs to test sync\n`);
if (PUBLIC) {
  console.log(`--public flag detected — creating shareable internet URL...`);
  startPublicTunnel();
} else {
  console.log(`tip: run with --public to get a shareable internet link:`);
  console.log(
    `  deno task share   (or deno run --allow-net --allow-read --allow-run server.ts -- --public)\n`,
  );
}
