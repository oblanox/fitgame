// src/ui/log_panel.ts
// Minimal DOM log panel: mirrors console.* into a nearby DOM pane with scrollbar.
// Usage: import { initGameLogger, pushLog, clearLog, setAutoFollow } from "./ui/log_panel";

type Level = "LOG" | "INFO" | "WARN" | "ERROR";

let originalConsoleLog = console.log.bind(console);
let originalConsoleInfo = console.info
  ? console.info.bind(console)
  : originalConsoleLog;
let originalConsoleWarn = console.warn
  ? console.warn.bind(console)
  : originalConsoleLog;
let originalConsoleError = console.error
  ? console.error.bind(console)
  : originalConsoleLog;

let hooked = false;

let containerEl: HTMLElement | null = null;
let headerBtnFollow: HTMLButtonElement | null = null;
let headerBtnClear: HTMLButtonElement | null = null;
let contentEl: HTMLElement | null = null;
let autoFollow = true;
let userScrolled = false;

/**
 * initGameLogger()
  */
export function initGameLogger(opts: { attachToSelector?: string } = {}) {
  if (!containerEl) createDomPanel(opts.attachToSelector);

  if (!hooked) {
    originalConsoleLog = console.log.bind(console);
    originalConsoleInfo = console.info
      ? console.info.bind(console)
      : originalConsoleLog;
    originalConsoleWarn = console.warn
      ? console.warn.bind(console)
      : originalConsoleLog;
    originalConsoleError = console.error
      ? console.error.bind(console)
      : originalConsoleLog;

    console.log = (...args: any[]) => {
      mirror("LOG", args);
      originalConsoleLog(...args);
    };
    console.info = (...args: any[]) => {
      mirror("INFO", args);
      originalConsoleInfo(...args);
    };
    console.warn = (...args: any[]) => {
      mirror("WARN", args);
      originalConsoleWarn(...args);
    };
    console.error = (...args: any[]) => {
      mirror("ERROR", args);
      originalConsoleError(...args);
    };

    hooked = true;
  }
}

/** Restore original console.* */
export function stopGameLogger() {
  if (!hooked) return;
  console.log = originalConsoleLog;
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  hooked = false;
}

/** Append a single line (string) to the DOM log */
export function pushLog(line: string, level: Level = "LOG") {
  if (!contentEl) createDomPanel();
  appendLine(String(line ?? ""), level);
}

/** Clear all lines */
export function clearLog() {
  if (!contentEl) createDomPanel();
  contentEl!.innerHTML = "";
  // reset scroll state
  userScrolled = false;
}

/** Toggle or set autofollow (autoscroll). If true, new logs scroll to bottom. */
export function setAutoFollow(value: boolean) {
  autoFollow = !!value;
  updateFollowButton();
  if (autoFollow) scrollToBottom();
}
export function toggleAutoFollow() {
  setAutoFollow(!autoFollow);
}
export function isAutoFollow() {
  return !!autoFollow;
}

/* ---------------- internal helpers ---------------- */

function createDomPanel(attachToSelector?: string) {
  // inject minimal CSS once
  injectStyles();

  // create elements
  const panel = document.createElement("div");
  panel.className = "cg-log-panel";

  const header = document.createElement("div");
  header.className = "cg-log-header";

  const title = document.createElement("div");
  title.className = "cg-log-title";
  title.textContent = "Game Log";

  headerBtnFollow = document.createElement("button");
  headerBtnFollow.className = "cg-log-btn";
  headerBtnFollow.title = "Toggle auto-follow";
  headerBtnFollow.onclick = () => {
    userScrolled = false; // if user clicks toggle, treat as returning to follow state
    toggleAutoFollow();
  };

  headerBtnClear = document.createElement("button");
  headerBtnClear.className = "cg-log-btn";
  headerBtnClear.title = "Clear log";
  headerBtnClear.textContent = "Clear";
  headerBtnClear.onclick = () => clearLog();

  header.appendChild(title);
  header.appendChild(headerBtnFollow);
  header.appendChild(headerBtnClear);

  contentEl = document.createElement("div");
  contentEl.className = "cg-log-content";
  contentEl.setAttribute("role", "log");
  contentEl.addEventListener(
    "scroll",
    () => {
      if (!contentEl) return;
      const atBottom =
        Math.abs(
          contentEl.scrollTop + contentEl.clientHeight - contentEl.scrollHeight
        ) < 2;
      userScrolled = !atBottom;
      if (atBottom && autoFollow) userScrolled = false;
      updateFollowButton();
    },
    { passive: true }
  );

  panel.appendChild(header);
  panel.appendChild(contentEl);

  // attach panel to DOM: prefer provided parent (e.g. '#canvas-wrap') else body
  const parent =
    (attachToSelector && document.querySelector(attachToSelector)) ||
    document.getElementById("canvas-wrap") ||
    document.body;

  // Add a marker class to parent so CSS controls layout responsively.
  // Do NOT set inline styles here — use CSS classes for responsive behavior.
  if (parent && parent instanceof HTMLElement) {
    parent.classList.add("cg-with-log");
  }

  parent.appendChild(panel);

  containerEl = panel;
  updateFollowButton();
}

/** Append a single DOM line with minimal markup and color by level */
function appendLine(text: string, level: Level = "LOG") {
  if (!contentEl) createDomPanel();
  const ln = document.createElement("div");
  ln.className = "cg-log-line cg-log-" + level.toLowerCase();
  // Use textContent so we keep automatic wrap, and safe from HTML injection
  ln.textContent = text;
  contentEl!.appendChild(ln);

  // autoscroll if allowed and user didn't scroll away
  if (autoFollow && !userScrolled) {
    scrollToBottom();
  }
}

/** Mirror console args into the panel as one joined line */
function mirror(level: Level, args: any[]) {
  try {
    const parts = args.map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    });
    appendLine((level ? `[${level}] ` : "") + parts.join(" "), level);
  } catch (e) {
    appendLine("[ERROR] (log mirror failed) " + String(e), "ERROR");
  }
}

/** scroll content to bottom */
function scrollToBottom() {
  if (!contentEl) return;
  // schedule to next animation frame so layout settles
  requestAnimationFrame(() => {
    if (!contentEl) return;
    contentEl.scrollTop = contentEl.scrollHeight;
    userScrolled = false;
    updateFollowButton();
  });
}

function updateFollowButton() {
  if (!headerBtnFollow) return;
  headerBtnFollow.textContent =
    autoFollow && !userScrolled
      ? "Follow ON"
      : autoFollow && userScrolled
      ? "Follow ON*"
      : "Follow OFF";
  headerBtnFollow.style.background = autoFollow ? "#3c3" : "#777";
  headerBtnFollow.style.color = autoFollow ? "#000" : "#fff";
}

function injectStyles() {
  if (document.getElementById("cg-log-panel-style")) return;
  const css = `
  /* Panel */
  .cg-log-panel {
    width: 60%;    
    max-height: 840px;
    background: #0f0f10;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    color: #eee;
    box-shadow: 0 6px 20px rgba(0,0,0,0.6);
    box-sizing: border-box;
    flex: 0 0 auto;
  }

  .cg-log-header {
    display:flex;
    gap:8px;
    align-items:center;
    justify-content: space-between;
    margin-bottom:8px;
  }
  .cg-log-title { font-weight:600; font-size:14px; }
  .cg-log-btn {
    background:#222; color:#eee;
    border:1px solid rgba(255,255,255,0.06);
    padding:6px 8px; border-radius:6px; cursor:pointer; font-size:12px;
  }

  .cg-log-content {
    overflow:auto;
    flex: 1 1 auto;
    padding:6px;
    border-radius:6px;
    background: linear-gradient(180deg, rgba(255,255,255,0.01), transparent);
    box-sizing:border-box;
  }
  .cg-log-line {
    white-space: normal;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.35;
    margin-bottom:4px;
  }
  .cg-log-log { color: #e6e6e6; }
  .cg-log-info { color: #9fdcff; }
  .cg-log-warn { color: #ffd58a; }
  .cg-log-error { color: #ff9b9b; font-weight:600; }

  /* Parent hook: when panel is attached to #canvas-wrap (or custom parent),
     we use flex layout so canvas and panel sit side-by-side on wide screens. */
  #canvas-wrap.cg-with-log {
    display: flex !important;
    flex-direction: row;
    align-items: flex-start;
    gap: 12px;
  }

  /* If attachToSelector was another element, we also support generic class */
  .cg-with-log {
    display: flex !important;
    flex-direction: row;
    align-items: flex-start;
    gap: 12px;
  }

  /* Responsive: on narrow screens stack column-wise: canvas on top, panel below */
  @media (max-width: 900px) {
    #canvas-wrap.cg-with-log,
    .cg-with-log {
      flex-direction: column !important;
      align-items: stretch;
    }
    /* make panel full-width under canvas on mobile */
    .cg-log-panel {
      width: 100% !important;
      max-height: 260px !important;
      margin-top: 8px;
    }
    /* ensure canvas does not overflow horizontally on mobile */
    #canvas-wrap canvas {
      max-width: 100%;
      height: auto;
    }
  }

  /* smaller screens tweaks */
  @media (max-width: 480px) {
    .cg-log-panel { padding: 6px; max-height: 220px; }
    .cg-log-btn { padding: 5px 6px; font-size: 11px; }
    .cg-log-title { font-size: 13px; }
  }
  `;
  const st = document.createElement("style");
  st.id = "cg-log-panel-style";
  st.appendChild(document.createTextNode(css));
  document.head.appendChild(st);
}

/* Export helper to create panel at custom place */
export function createPanelAt(selector: string) {
  createDomPanel(selector);
}

/* small utility to ensure panel exists and return its element */
export function getPanelElement() {
  if (!containerEl) createDomPanel();
  return containerEl;
}
