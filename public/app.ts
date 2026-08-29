/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
declare const YT: {
  Player: new (id: string, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
};
type YTPlayerOptions = {
  host: string;
  width: string;
  height: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady: () => void;
    onStateChange: (e: { data: number }) => void;
    onPlaybackRateChange: (e: { data: number }) => void;
    onError?: (e: { data: number }) => void;
  };
};
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  setPlaybackRate(rate: number): void;
}

type ServerMsg =
  | { type: "clients"; count: number }
  | { type: "public_url"; url: string }
  | {
    type: "load";
    videoId: string;
    currentTime?: number;
    isPlaying?: boolean;
    queue?: string[];
    queueIndex?: number;
  }
  | { type: "queue"; queue: string[]; queueIndex: number }
  | {
    type: "sync";
    videoId: string | null;
    currentTime: number;
    isPlaying: boolean;
    playbackRate: number;
    queue: string[];
    queueIndex: number;
    publicUrl?: string | null;
  }
  | { type: "play"; currentTime: number }
  | { type: "pause"; currentTime: number }
  | { type: "seek"; currentTime: number }
  | { type: "rate"; playbackRate: number };

const $ = <T extends Element = HTMLElement>(s: string): T =>
  document.querySelector(s) as T;

const urlInput = $("#urlInput") as HTMLInputElement;
const loadBtn = $("#loadBtn") as HTMLButtonElement;
const addBtn = $("#addBtn") as HTMLButtonElement;
const placeholder = $("#placeholder") as HTMLElement;
const connDot = $("#conn") as HTMLElement;
const connText = $("#connText") as HTMLElement;
const clientsEl = $("#clients") as HTMLElement;
const videoLabel = $("#videoLabel") as HTMLElement;
const musicBtn = $("#musicBtn") as HTMLButtonElement;
const themeBtn = $("#themeBtn") as HTMLButtonElement;
const shareBtn = $("#shareBtn") as HTMLButtonElement;
const queueList = $("#queueList") as HTMLElement;
const qcount = $("#qcount") as HTMLElement;
const emptyQ = $("#emptyQ") as HTMLElement;
const cover = $("#cover") as HTMLElement;
const coverImg = $("#coverImg") as HTMLImageElement;
const coverTitle = $("#coverTitle") as HTMLElement;
const shortcutsBtn = $("#shortcutsBtn") as HTMLButtonElement;
const shortcutsPanel = $("#shortcutsPanel") as HTMLElement;

let player: YTPlayer | null = null;
let playerReady = false;
let suppressUntil = 0;
let ws: WebSocket | null = null;
let currentVideoId: string | null = null;
let queue: string[] = [];
let queueIndex = -1;
let isPlaying = false;

function isSuppressed(): boolean {
  return Date.now() < suppressUntil;
}
function suppress(ms = 1200): void {
  suppressUntil = Date.now() + ms;
}

function extractVideoId(url: string): string | null {
  if (!url) return null;
  url = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1).split("/")[0].slice(0, 11);
    }
    if (u.searchParams.get("v")) return u.searchParams.get("v")!;
    const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[2];
  } catch {
  }
  const m = url.match(/[a-zA-Z0-9_-]{11}/);
  return m ? m[0] : null;
}

const thumb = (id: string): string =>
  `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
function fmt(s: number): string {
  if (!isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

function applyTheme(theme: string): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("yt-theme", theme);

  themeBtn.textContent = theme === "light" ? "Dark mode" : "Light mode";
  themeBtn.setAttribute(
    "aria-label",
    theme === "light" ? "Switch to dark" : "Switch to light",
  );
}
const savedTheme = localStorage.getItem("yt-theme");
if (savedTheme) applyTheme(savedTheme);
else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
  applyTheme("light");
} else applyTheme("dark");
themeBtn.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") === "light"
    ? "dark"
    : "light";
  applyTheme(cur);
});

const menuBtn = document.getElementById("menuBtn") as HTMLButtonElement;
const menuPanel = document.getElementById("menuPanel") as HTMLElement;
menuBtn.addEventListener("click", () => {
  const isHidden = menuPanel.classList.contains("hidden");
  menuPanel.classList.toggle("hidden", !isHidden);
  menuBtn.setAttribute("aria-expanded", String(isHidden));
});
document.addEventListener("click", (e) => {
  if (
    !menuBtn.contains(e.target as Node) && !menuPanel.contains(e.target as Node)
  ) {
    menuPanel.classList.add("hidden");
    menuBtn.setAttribute("aria-expanded", "false");
  }
});

shortcutsBtn.addEventListener("click", () => {
  const isHidden = shortcutsPanel.classList.contains("hidden");
  shortcutsPanel.classList.toggle("hidden", !isHidden);
  shortcutsBtn.setAttribute("aria-expanded", String(isHidden));
});
document.addEventListener("click", (e) => {
  if (
    !shortcutsBtn.contains(e.target as Node) &&
    !shortcutsPanel.contains(e.target as Node)
  ) {
    shortcutsPanel.classList.add("hidden");
    shortcutsBtn.setAttribute("aria-expanded", "false");
  }
});

let publicUrl: string | null = null;
const titleCache = new Map<string, string>();

async function fetchTitle(id: string): Promise<string> {
  if (titleCache.has(id)) return titleCache.get(id)!;
  try {
    const r = await fetch(`/api/title?id=${id}`);
    if (r.ok) {
      const j = await r.json() as { title: string };
      titleCache.set(id, j.title);
      return j.title;
    }
  } catch {}
  titleCache.set(id, id);
  return id;
}

function updateCover(): void {
  const isMusic = document.body.classList.contains("music");
  if (isMusic && currentVideoId) {
    cover.classList.remove("hidden");
    coverImg.src = thumb(currentVideoId);
    const t = titleCache.get(currentVideoId);
    coverTitle.textContent = t ?? currentVideoId;
    if (!t) {
      fetchTitle(currentVideoId).then((title) => {
        coverTitle.textContent = title;
      });
    }
  } else {
    cover.classList.add("hidden");
  }
}

function setMusicMode(on: boolean): void {
  document.body.classList.toggle("music", on);
  musicBtn.classList.toggle("active", on);
  localStorage.setItem("yt-music", on ? "1" : "0");
  updateCover();
}

musicBtn.addEventListener(
  "click",
  () => setMusicMode(!document.body.classList.contains("music")),
);
cover.addEventListener("click", () => setMusicMode(false));
setMusicMode(localStorage.getItem("yt-music") === "1");

let ytInitAttempts = 0;
function createPlayer(): void {
  ytInitAttempts++;
  console.log(
    "[sameframe] createPlayer attempt",
    ytInitAttempts,
    "YT?",
    typeof YT,
    "playerWrap",
    !!document.getElementById("player"),
  );
  try {
    player = new YT.Player("player", {
      host: "https://www.youtube-nocookie.com",
      width: "100%",
      height: "100%",
      playerVars: {
        modestbranding: 1,
        rel: 0,
        enablejsapi: 1,
        playsinline: 1,
        origin: location.origin,
      } as Record<string, number | string>,
      events: {
        onReady: () => {
          playerReady = true;
          console.log("[sameframe] YT ready (onReady) playerReady=true");
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "sync_request" }));
          }
        },
        onError: (e: { data: number }) => {
          console.error(
            "[sameframe] YT player error",
            e.data,
            "https://developers.google.com/youtube/iframe_api_reference#onError",
          );
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === YT.PlayerState.ENDED) {
            if (!isSuppressed()) send({ type: "ended" });
            isPlaying = false;
            return;
          }
          if (isSuppressed()) return;
          const t = player!.getCurrentTime();
          if (e.data === YT.PlayerState.PLAYING) {
            isPlaying = true;
            send({ type: "play", currentTime: t });
          } else if (e.data === YT.PlayerState.PAUSED) {
            isPlaying = false;
            send({ type: "pause", currentTime: t });
          }
        },
        onPlaybackRateChange: (e: { data: number }) => {
          if (!isSuppressed()) send({ type: "rate", playbackRate: e.data });
        },
      },
    });
  } catch (err) {
    console.error("[sameframe] createPlayer failed", err);
  }
}

function onYouTubeIframeAPIReady(): void {
  console.log("[sameframe] onYouTubeIframeAPIReady called, YT?", typeof YT);
  createPlayer();
}

const w = window as unknown as Record<string, unknown> & {
  _ytAppReady?: () => void;
  _ytReadySeen?: boolean;
};
w._ytAppReady = onYouTubeIframeAPIReady;
if (w._ytReadySeen) {
  console.log(
    "[sameframe] YT was already ready (stub seen), creating player now",
  );
  onYouTubeIframeAPIReady();
} else {
  w.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
}

setTimeout(() => {
  if (!playerReady) {
    console.warn(
      "[sameframe] YT not ready after 4s — YT?",
      typeof YT,
      "YT.Player?",
      typeof (window as unknown as { YT?: unknown }).YT,
      "url",
      location.href,
    );

    if (typeof YT === "undefined") {
      console.warn("[sameframe] YT undefined — retry loading iframe_api");
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () =>
        console.error("[sameframe] retry iframe_api load error");
      s.onload = () => console.log("[sameframe] retry iframe_api loaded");
      document.head.appendChild(s);
    } else if (!player) {
      console.warn(
        "[sameframe] YT defined but player null — retry createPlayer",
      );
      createPlayer();
    }
  }
}, 4000);
setInterval(() => {
  if (!playerReady) {
    console.log(
      "[sameframe] still not ready — playerReady false, YT?",
      typeof YT,
    );
  }
}, 5000);

let lastTime = 0;
setInterval(() => {
  if (!player || !player.getCurrentTime || !playerReady) return;
  const t = player.getCurrentTime();
  const state = player.getPlayerState ? player.getPlayerState() : -1;
  isPlaying = state === 1;
  if (Math.abs(t - lastTime) > 1.5 && !isSuppressed() && state !== -1) {
    send({ type: "seek", currentTime: t });
  }
  lastTime = t;

  if (currentVideoId) {
    const title = titleCache.get(currentVideoId);
    videoLabel.textContent = (title ?? currentVideoId) +
      (queueIndex >= 0 ? `  •  ${queueIndex + 1}/${queue.length}` : "");
  }
}, 400);

let wsFailed = false;
let pollTimer: number | null = null;

function connect(): void {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  try {
    ws = new WebSocket(`${proto}//${location.host}/ws`);
  } catch (err) {
    console.warn("[sameframe] WS construct failed", err);
    wsFailed = true;
    startPolling();
    return;
  }
  ws.onopen = () => {
    connDot.className = "dot on";
    connText.textContent = "connected";
    wsFailed = false;
    stopPolling();
    ws!.send(JSON.stringify({ type: "sync_request" }));
    console.log("[sameframe] WS connected", location.host);
  };
  ws.onclose = () => {
    connDot.className = "dot off";
    connText.textContent = "disconnected — retrying…";
    console.warn("[sameframe] WS closed");
    wsFailed = true;
    startPolling();
    setTimeout(connect, 1500);
  };
  ws.onerror = (e) => {
    connDot.className = "dot off";
    connText.textContent = "WS error — polling";
    console.warn("[sameframe] WS error", e);
    wsFailed = true;
    startPolling();
  };
  ws.onmessage = (e: MessageEvent) =>
    handleServer(JSON.parse(e.data) as ServerMsg & Record<string, unknown>);
}
function send(obj: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
    return;
  }

  const m = obj as Record<string, unknown>;
  if (m.type === "load" && typeof m.videoId === "string") {
    fetch(`/api/sync?poll=1`, { method: "GET" }).catch(() => {});
  }
}

async function pollSync(): Promise<void> {
  try {
    const r = await fetch("/api/sync");
    if (!r.ok) return;
    const data = (await r.json()) as ServerMsg & Record<string, unknown>;

    if (data.videoId && data.videoId !== currentVideoId) {
      console.log("[sameframe] poll sync -> load", data.videoId);
      handleServer(data);
    } else if (data.videoId) {
      handleServer(data);
    }
    if ((data as { publicUrl?: string | null }).publicUrl) {
      publicUrl = (data as { publicUrl: string | null }).publicUrl!;
    }
  } catch {
  }
}
function startPolling(): void {
  if (pollTimer !== null) return;
  console.log(
    "[sameframe] starting HTTP polling fallback (WS blocked on tunnel)",
  );
  pollTimer = window.setInterval(pollSync, 2000);
  pollSync();
}
function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function handleServer(msg: ServerMsg & Record<string, unknown>): void {
  switch (msg.type) {
    case "clients":
      clientsEl.textContent = `${(msg as { count: number }).count} viewer${
        (msg as { count: number }).count !== 1 ? "s" : ""
      }`;
      break;
    case "public_url":
      publicUrl = (msg as { url: string }).url;
      console.log("public url:", publicUrl);
      break;
    case "load": {
      const m = msg as {
        queue?: string[];
        queueIndex?: number;
        videoId: string;
        currentTime?: number;
        isPlaying?: boolean;
      };
      if (Array.isArray(m.queue)) {
        queue = m.queue!;
        queueIndex = m.queueIndex!;
        renderQueue();
      }
      applyLoad(m.videoId, m.currentTime ?? 0, m.isPlaying !== false);
      break;
    }
    case "queue": {
      const m = msg as { queue: string[]; queueIndex: number };
      queue = m.queue || [];
      queueIndex = m.queueIndex;
      renderQueue();
      if (currentVideoId) {
        videoLabel.textContent = currentVideoId +
          (queueIndex >= 0 ? `  •  ${queueIndex + 1}/${queue.length}` : "");
      }
      break;
    }
    case "sync": {
      const m = msg as {
        queue?: string[];
        queueIndex?: number;
        videoId: string | null;
        currentTime: number;
        isPlaying: boolean;
        playbackRate?: number;
        publicUrl?: string | null;
      };
      if (Array.isArray(m.queue)) {
        queue = m.queue!;
        queueIndex = m.queueIndex!;
        renderQueue();
      }
      if (m.videoId) {
        if (m.videoId !== currentVideoId) {
          applyLoad(m.videoId, m.currentTime, m.isPlaying);
        } else applySync(m.currentTime, m.isPlaying);
      }
      if (m.playbackRate && player && player.setPlaybackRate) {
        try {
          suppress(800);
          player.setPlaybackRate(m.playbackRate);
        } catch {
        }
      }
      if (m.publicUrl) publicUrl = m.publicUrl;
      break;
    }
    case "play":
      applyPlay((msg as { currentTime: number }).currentTime);
      break;
    case "pause":
      applyPause((msg as { currentTime: number }).currentTime);
      break;
    case "seek":
      applySeek((msg as { currentTime: number }).currentTime);
      break;
    case "rate":
      if (player && player.setPlaybackRate) {
        suppress(800);
        try {
          player.setPlaybackRate(
            (msg as { playbackRate: number }).playbackRate,
          );
        } catch {
        }
      }
      break;
  }
}

function ensureReady(cb: () => void): void {
  if (playerReady && player) cb();
  else {
    console.log(
      "[sameframe] ensureReady waiting — playerReady",
      playerReady,
      "player",
      !!player,
    );
    setTimeout(() => ensureReady(cb), 200);
  }
}

function applyLoad(videoId: string, time: number, shouldPlay: boolean): void {
  currentVideoId = videoId;
  placeholder.classList.add("hidden");
  const cached = titleCache.get(videoId);
  const label = (cached ?? videoId) +
    (queueIndex >= 0 ? `  •  ${queueIndex + 1}/${queue.length}` : "");
  videoLabel.textContent = label;
  const pageTitle = cached ?? videoId;
  document.title = `${pageTitle} - Sameframe`;
  if (!cached) {
    fetchTitle(videoId).then((t) => {
      if (currentVideoId === videoId) {
        videoLabel.textContent = t +
          (queueIndex >= 0 ? `  •  ${queueIndex + 1}/${queue.length}` : "");
        document.title = `${t} - Sameframe`;
        updateCover();
        renderQueue();
      }
    });
  }
  renderQueue();
  updateCover();
  console.log(
    "[sameframe] applyLoad",
    videoId,
    "ready:",
    playerReady,
    "music:",
    document.body.classList.contains("music"),
  );
  ensureReady(() => {
    console.log("[sameframe] loadVideoById", videoId, time);
    suppress(1500);
    try {
      player!.loadVideoById({ videoId, startSeconds: time });
    } catch (err) {
      console.error("[sameframe] loadVideoById failed", err);
      setTimeout(() => {
        try {
          player!.loadVideoById({ videoId, startSeconds: time });
        } catch (e) {
          console.error(e);
        }
      }, 500);
    }
    if (!shouldPlay) {
      setTimeout(() => {
        try {
          suppress(800);
          player!.pauseVideo();
          if (time) player!.seekTo(time, true);
        } catch {
        }
      }, 800);
    }
  });
  history.replaceState(null, "", `?v=${videoId}`);
  setTimeout(updateCover, 200);
}

function applySync(remoteTime: number, isPlayingRemote: boolean): void {
  if (!player || !playerReady) return;
  const local = player.getCurrentTime ? player.getCurrentTime() : 0;
  const drift = Math.abs(local - remoteTime);
  if (drift > 1.2) {
    suppress(1200);
    try {
      player.seekTo(remoteTime, true);
    } catch {
    }
  }
  const state = player.getPlayerState ? player.getPlayerState() : -1;
  if (isPlayingRemote && state !== 1) {
    suppress(800);
    try {
      player.playVideo();
    } catch {
    }
    isPlaying = true;
  } else if (!isPlayingRemote && state === 1) {
    suppress(800);
    try {
      player.pauseVideo();
    } catch {
    }
    isPlaying = false;
  }
}
function applyPlay(t: number): void {
  if (!playerReady || !player) return;
  suppress(1200);
  try {
    const l = player.getCurrentTime();
    if (Math.abs(l - t) > 1.2) player.seekTo(t, true);
    player.playVideo();
    isPlaying = true;
  } catch {
  }
}
function applyPause(t: number): void {
  if (!playerReady || !player) return;
  suppress(1200);
  try {
    const l = player.getCurrentTime();
    if (Math.abs(l - t) > 1.2) player.seekTo(t, true);
    player.pauseVideo();
    isPlaying = false;
  } catch {
  }
}
function applySeek(t: number): void {
  if (!playerReady || !player) return;
  suppress(1200);
  try {
    player.seekTo(t, true);
  } catch {
  }
}

function moveQueueItem(from: number, to: number): void {
  const [videoId] = queue.splice(from, 1);
  if (!videoId) return;
  queue.splice(to, 0, videoId);
  queueIndex = currentVideoId ? queue.indexOf(currentVideoId) : -1;
  renderQueue();
  send({ type: "queue_reorder", from, to });
}

function renderQueue(): void {
  qcount.textContent = queue.length ? `(${queue.length})` : "";
  queueList.innerHTML = "";
  if (queue.length === 0) {
    emptyQ.classList.remove("hidden");
    return;
  }
  emptyQ.classList.add("hidden");
  queue.forEach((id, i) => {
    const li = document.createElement("li");
    li.className = i === queueIndex ? "active" : "";
    const title = titleCache.get(id);
    if (!title) {
      fetchTitle(id).then((t) => {
        const el = li.querySelector(".qtitle");
        if (el) el.textContent = t;
        if (currentVideoId === id) {
          videoLabel.textContent = t +
            (queueIndex >= 0 ? `  •  ${queueIndex + 1}/${queue.length}` : "");
        }
      });
    }
    li.innerHTML =
      `<button class="drag-handle" type="button" title="Drag to reorder" aria-label="Drag to reorder">⠿</button><img class="qthumb" src="${
        thumb(id)
      }" loading="lazy"/><div class="qtitle">${
        title ?? id
      }</div><button class="qdel" title="remove">Remove</button>`;
    li.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".qdel, .drag-handle")) return;
      queueIndex = i;
      currentVideoId = id;
      if (document.body.classList.contains("music")) setMusicMode(false);
      send({ type: "load", videoId: id });
      applyLoad(id, 0, true);
    });
    (li.querySelector(".qdel") as HTMLButtonElement).addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        send({ type: "queue_remove", index: i });
        queue.splice(i, 1);
        if (queueIndex >= queue.length) queueIndex = queue.length - 1;
        renderQueue();
      },
    );
    const handle = li.querySelector(".drag-handle") as HTMLButtonElement;
    handle.addEventListener("pointerdown", (e: PointerEvent) => {
      e.preventDefault();
      let targetIndex = i;
      li.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
      const updateTarget = (move: PointerEvent) => {
        const row = document.elementFromPoint(move.clientX, move.clientY)
          ?.closest("li");
        const rows = Array.from(queueList.children);
        const nextIndex = rows.indexOf(row as Element);
        if (nextIndex >= 0) {
          targetIndex = nextIndex;
          rows.forEach((item, index) =>
            item.classList.toggle(
              "drag-over",
              index === targetIndex && index !== i,
            )
          );
        }
      };
      const finish = () => {
        li.classList.remove("dragging");
        Array.from(queueList.children).forEach((item) =>
          item.classList.remove("drag-over")
        );
        if (targetIndex !== i) moveQueueItem(i, targetIndex);
        handle.removeEventListener("pointermove", updateTarget);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
      };
      handle.addEventListener("pointermove", updateTarget);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
    queueList.appendChild(li);
  });
}

function doPlayNow(): void {
  const id = extractVideoId(urlInput.value);
  if (!id) {
    urlInput.style.borderColor = "#ef4444";
    setTimeout(() => (urlInput.style.borderColor = ""), 1200);
    return;
  }

  if (document.body.classList.contains("music")) setMusicMode(false);
  send({ type: "load", videoId: id });
  applyLoad(id, 0, true);
  urlInput.value = "";
}
function doQueue(): void {
  const id = extractVideoId(urlInput.value);
  if (!id) {
    urlInput.style.borderColor = "#ef4444";
    setTimeout(() => (urlInput.style.borderColor = ""), 1200);
    return;
  }
  const wasEmpty = queue.length === 0 && !currentVideoId;
  console.log(
    "[sameframe] doQueue",
    id,
    "wasEmpty",
    wasEmpty,
    "ws",
    ws?.readyState,
  );
  send({ type: "queue_add", videoId: id });
  if (!queue.includes(id)) {
    queue.push(id);
    renderQueue();
  }

  if (wasEmpty) {
    console.log("[sameframe] queue was empty -> auto load");
    if (document.body.classList.contains("music")) {
    }
    applyLoad(id, 0, true);
  }
  urlInput.value = "";
}
loadBtn.addEventListener("click", doPlayNow);
addBtn.addEventListener("click", doQueue);
urlInput.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter") doQueue();
});

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
}

function seekBy(seconds: number): void {
  if (!player || !playerReady || !currentVideoId) return;
  const target = Math.max(0, player.getCurrentTime() + seconds);
  suppress(800);
  try {
    player.seekTo(target, true);
    send({ type: "seek", currentTime: target });
  } catch {
  }
}

function togglePlayback(): void {
  if (!player || !playerReady || !currentVideoId) return;
  const time = player.getCurrentTime();
  suppress(800);
  try {
    if (isPlaying) {
      player.pauseVideo();
      isPlaying = false;
      send({ type: "pause", currentTime: time });
    } else {
      player.playVideo();
      isPlaying = true;
      send({ type: "play", currentTime: time });
    }
  } catch {
  }
}

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (isTypingTarget(e.target)) return;
  if (e.key === "/") {
    e.preventDefault();
    urlInput.focus();
  } else if (e.key === " ") {
    e.preventDefault();
    togglePlayback();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    seekBy(-5);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    seekBy(5);
  }
});

($("#clearQ") as HTMLButtonElement).addEventListener(
  "click",
  () => send({ type: "queue_clear" }),
);

async function fetchPublicUrl(): Promise<void> {
  try {
    const r = await fetch("/api/public-url");
    if (r.ok) {
      const j = (await r.json()) as { url: string | null };
      if (j.url) publicUrl = j.url;
    }
  } catch {
  }
}
fetchPublicUrl();
setInterval(fetchPublicUrl, 5000);

setInterval(() => {
  if (wsFailed || !ws || ws.readyState !== WebSocket.OPEN) pollSync();
}, 2500);

function getShareUrl(): string {
  const v = currentVideoId ? `?v=${currentVideoId}` : location.search;
  if (publicUrl) return publicUrl.replace(/\/$/, "") + v;
  if (
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1" &&
    !location.hostname.startsWith("192.168.") &&
    !location.hostname.startsWith("10.")
  ) {
    return location.origin + v;
  }
  return location.href;
}

shareBtn.addEventListener("click", async () => {
  const url = getShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = "✓ Copied";
    setTimeout(() => (shareBtn.textContent = "↗ Share"), 1500);
  } catch {
    prompt("Copy link:", url);
  }
  console.log("share url:", url, publicUrl ? "(public)" : "(local)");
});

const initial = new URLSearchParams(location.search).get("v");
if (initial) {
  const id = extractVideoId(initial);
  if (id) urlInput.value = id;
}

connect();
(window as unknown as Record<string, unknown>)._ytSync = {
  extractVideoId,
  send,
};
