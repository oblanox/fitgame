// ui/log_panel.ts (sequential typewriter, no textBounds)
import p5 from "p5";

type Level = "log" | "warn" | "error" | "info";

type LogEntry = {
  level: Level;
  text: string;
  time: number;
  reveal: number;
  height?: number; // кэш высоты (px)
  wrapped?: string[]; // кэш строк после переноса
};

const MAX_HISTORY = 200;
const CHAR_PER_SEC = 40;
const PADDING = 12;
const LINE_GAP = 4; // промежуток между абзацами
const LINE_HEIGHT_EM = 1.2; // множитель высоты строки

let history: LogEntry[] = []; // завершённые записи
let queue: LogEntry[] = []; // ожидают анимации
let current: LogEntry | null = null;

const original = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

export function gameLog(...args: any[]) {
  push("log", args);
}
export function gameWarn(...args: any[]) {
  push("warn", args);
}
export function gameError(...args: any[]) {
  push("error", args);
}
export function gameInfo(...args: any[]) {
  push("info", args);
}

function stringify(arg: any): string {
  try {
    if (typeof arg === "string") return arg;
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function push(level: Level, args: any[]) {
  const text = args.map(stringify).join(" ");
  const entry: LogEntry = { level, text, time: performance.now(), reveal: 0 };
  queue.push(entry);
  if (history.length > MAX_HISTORY)
    history = history.slice(history.length - MAX_HISTORY);
}

export function initGameLogger() {
  console.log = (...a: any[]) => {
    original.log.apply(console, a);
    push("log", a);
  };
  console.warn = (...a: any[]) => {
    original.warn.apply(console, a);
    push("warn", a);
  };
  console.error = (...a: any[]) => {
    original.error.apply(console, a);
    push("error", a);
  };
  console.info = (...a: any[]) => {
    original.info.apply(console, a);
    push("info", a);
  };
}

function levelColor(s: p5, level: Level) {
  switch (level) {
    case "warn":
      s.fill(120, 90, 10);
      break;
    case "error":
      s.fill(150, 20, 20);
      break;
    case "info":
      s.fill(30, 80, 130);
      break;
    default:
      s.fill(30);
      break;
  }
}

function getPanelRect(s: p5, _cfg: any) {
  const fr: any = (window as any).__fieldRect || null;
  const panelW = Math.max(260, s.width * 0.28);

  // x — справа от поля, если оно есть; иначе у правого края
  const x = fr
    ? Math.min(fr.fieldX + fr.fieldW + 16, s.width - panelW - 16)
    : s.width - panelW - 16;

  // ВЕРХ ПАНЕЛИ — ВСЕГДА У ВЕРХА ХОЛСТА
  const y = 16;
  const w = panelW;
  const h = s.height - 32;

  return { x, y, w, h };
}

function stepAnimation(s: p5) {
  if (!current && queue.length) {
    current = queue.shift() || null;
    if (current) current.reveal = 0;
  }
  if (!current) return;

  const dt = s.deltaTime / 1000;
  current.reveal = Math.min(
    current.text.length,
    current.reveal + CHAR_PER_SEC * dt
  );
  if (current.reveal >= current.text.length) {
    history.push(current);
    if (history.length > MAX_HISTORY) {
      history = history.slice(history.length - MAX_HISTORY);
    }
    current = null;
  }
}

/** Перенос текста по словам на заданную ширину. Возвращает массив строк. */
function wrapText(s: p5, text: string, maxW: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  const pushLine = () => {
    lines.push(line);
    line = "";
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? line + " " + word : word;
    if (s.textWidth(candidate) <= maxW) {
      line = candidate;
    } else {
      if (line) pushLine();
      // если слово само шире строки — грубо режем по символам
      if (s.textWidth(word) > maxW) {
        let buf = "";
        for (const ch of word) {
          const cand = buf + ch;
          if (s.textWidth(cand) > maxW && buf) {
            lines.push(buf);
            buf = ch;
          } else {
            buf = cand;
          }
        }
        line = buf; // остаток в текущую строку
      } else {
        line = word;
      }
    }
  }
  if (line) pushLine();
  return lines;
}

/** Высота блока текста (с учётом переносов), px */
function measureTextBlockHeight(
  s: p5,
  text: string,
  maxW: number
): { lines: string[]; height: number } {
  const baseLine = s.textAscent() + s.textDescent();
  const lineH = baseLine * LINE_HEIGHT_EM;
  const lines = wrapText(s, text, maxW);
  return { lines, height: lines.length * lineH };
}

export function drawLogPanel(s: p5, cfg: any) {
  stepAnimation(s);
  const { x, y, w, h } = getPanelRect(s, cfg);

  s.push();
  s.noStroke();
  s.fill(255, 255, 255, 220);
  s.rect(x, y, w, h, 10);
  s.stroke(0, 0, 0, 60);
  s.noFill();
  s.rect(x, y, w, h, 10);

  s.noStroke();
  s.fill(20);
  s.textAlign(s.LEFT, s.TOP);
  s.textSize(14);
  s.text("LOG", x + PADDING, y + PADDING);

  const contentX = x + PADDING;
  const contentY = y + PADDING + 24; // сразу под заголовком
  const contentW = w - PADDING * 2;
  const contentH = h - (contentY - y) - PADDING;

  // clip
  (s as any).drawingContext.save();
  (s as any).drawingContext.beginPath();
  (s as any).drawingContext.rect(contentX, contentY, contentW, contentH);
  (s as any).drawingContext.clip();

  s.textSize(12);
  s.textAlign(s.LEFT, s.TOP);

  const lineH = (s.textAscent() + s.textDescent()) * 1.2;
  let cursorY = contentY;

  // рисуем ИСТОРИЮ сверху вниз (берём только хвост, который помещается)
  const linesFrom = Math.max(0, history.length - 200);
  for (let i = linesFrom; i < history.length; i++) {
    const e = history[i];
    levelColor(s, e.level);

    const lines = e.wrapped ?? wrapText(s, e.text, contentW);
    // если следующая запись не влезает — выходим
    if (cursorY + lines.length * lineH > contentY + contentH) break;

    for (const ln of lines) {
      s.text(ln, contentX, cursorY);
      cursorY += lineH;
    }
    cursorY += 4; // небольшой зазор
  }

  // текущая строка — в самом конце списка
  if (current && cursorY < contentY + contentH) {
    levelColor(s, current.level);
    const shown = current.text.slice(0, Math.floor(current.reveal));
    const curLines = wrapText(s, shown, contentW);
    for (const ln of curLines) {
      if (cursorY + lineH > contentY + contentH) break;
      s.text(ln, contentX, cursorY);
      cursorY += lineH;
    }
  }

  (s as any).drawingContext.restore();
  s.pop();
}
