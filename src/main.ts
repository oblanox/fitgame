import p5 from "p5";
import { drawPlayerHpBar } from "./ui/interface";

/* ──────────────────────────────────────────────────────────────────────────────
  СТИХИИ И ВСПОМОГАТЕЛЬНОЕ
  - ElementKey: 4 стихии проекта.
  - ELEMENT_COLOR: цвет круга на поле.
  - toElementKey: нормализация значений из config.json
    (понимает новые earth/water .
────────────────────────────────────────────────────────────────────────────── */
type ElementKey = "earth" | "fire" | "water" | "cosmos";

const ELEMENT_COLOR: Record<ElementKey, string> = {
  earth: "#129447", // зелёный — земля
  fire: "#E53935", // красный — огонь
  water: "#1E88E5", // синий — вода
  cosmos: "#8E24AA", // фиолетовый — космос
};

// алиасы для совместимости со старыми конфигами (green→earth, cold→water)
const ELEMENT_ALIAS: Record<string, ElementKey> = {
  earth: "earth",
  fire: "fire",
  water: "water",
  cosmos: "cosmos",
  green: "earth",
  cold: "water",
};
function toElementKey(s: string): ElementKey {
  const k = (s ?? "").toLowerCase();
  return ELEMENT_ALIAS[k] ?? "earth";
}

// крошечные утилиты
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/* ──────────────────────────────────────────────────────────────────────────────
  ТИПЫ КОНФИГА (используемая часть)
  - FieldCfg: визуальные параметры поля (цвета, размеры, линии).
  - BossCfg, MinionCfg: то, что рендерим на поле.
  - Cfg: корневой конфиг.
  Примечание: все поля опциональные, дефолты подставляются в коде.
────────────────────────────────────────────────────────────────────────────── */
type Padding = { left: number; right: number; top: number; bottom: number };

type FieldCfg = {
  bg?: string; // цвет фона области боя
  line?: string; // цвет горизонтальных линий
  rows?: number; // кол-во линий (и, соответственно, «уровней»)
  widthRatio?: number; // доля ширины canvas, которую занимает поле
  padding?: Padding; // отступы поля от краёв canvas
  lineInsetTop?: number; // отступ верхней линии от верхней границы поля
  lineInsetBottom?: number; // отступ нижней линии от нижней границы поля
  lineThickness?: number; // толщина линии
  lineStep?: number; // ЯВНЫЙ шаг между линиями (px). Если не влезает — урежем.
};

type PlayerCfg = { hpMax: number; hp: number; hits: number };

type BossCfg = {
  type: number;
  element: string;
  hp: number;
  atk: number;
  row?: number;
  col?: number;
  radius?: number;
  lineOffset?: number; // индивидуальный вертикальный сдвиг от линии
};

type MinionCfg = {
  id: number;
  type: number;
  element: string;
  hp: number;
  atk: number;
  row?: number;
  col?: number;
  radius?: number;
  lineOffset?: number; // индивидуальный вертикальный сдвиг от линии
};

type Cfg = {
  field?: FieldCfg;
  player: PlayerCfg;
  boss: BossCfg;
  minions: MinionCfg[];
};

/* ──────────────────────────────────────────────────────────────────────────────
  СОСТОЯНИЕ ВИЗУАЛИЗАЦИИ
  - cfg: текущая конфигурация (из /public/config.json или загруженная файлом).
  - enemies: подготовленные к рендеру сущности (миньоны + босс).
────────────────────────────────────────────────────────────────────────────── */
let cfg: Cfg | null = null;

const abilityIdx = 1; // пока просто выводим в шапке
const weaponIdx = 1;

let playerHp = 0;
let hitsLeft = 0;

type Enemy = {
  id: number;
  kind: "minion" | "boss";
  element: ElementKey;
  hp: number;
  atk: number;
  row: number; // 1..rows (индекс линии снизу вверх)
  col: number; // 0..1 (доля от ширины поля слева→вправо)
  x: number;
  y: number; // абсолютные координаты центра
  r: number; // радиус круга (px)
  lineOffset: number; // смещение относительно линии (+вниз, -вверх)
};
let enemies: Enemy[] = [];

/* ──────────────────────────────────────────────────────────────────────────────
  ЗАГРУЗКА И НОРМАЛИЗАЦИЯ КОНФИГА
  - loadConfig(): fetch → cfg → resetSession()
  - resetSession(): перенос значений из cfg в runtime-состояние (enemies и пр.)
  - normalize…(): приводим earth/water и старые ключи, подставляем дефолты поля
────────────────────────────────────────────────────────────────────────────── */
async function loadConfig(url = "/config.json") {
  try {
    const r = await fetch(url, { cache: "no-store" });
    cfg = (await r.json()) as Cfg;
  } catch (e) {
    console.error("config load failed", e);
    // аварийный дефолт для быстрой проверки сцены
    cfg = {
      field: {
        bg: "#F9EDD6",
        line: "#B0846A",
        rows: 4,
        widthRatio: 0.35,
        padding: { left: 80, right: 40, top: 40, bottom: 120 },
        lineInsetTop: 14,
        lineInsetBottom: 14,
        lineThickness: 3,
        lineStep: 68,
      },
      player: { hpMax: 2200, hp: 2200, hits: 60 },
      boss: {
        type: 1,
        element: "earth",
        hp: 88,
        atk: 28,
        row: 4,
        col: 0.5,
        radius: 80,
        lineOffset: 10,
      },
      minions: [],
    };
  }
  normalizeConfig();
  resetSession();
}

// подставляем дефолты для поля и нормализуем элементы
function normalizeConfig() {
  if (!cfg) return;

  // нормализуем элементы
  cfg.boss.element = toElementKey(cfg.boss.element);
  cfg.minions = cfg.minions.map((m) => ({
    ...m,
    element: toElementKey(m.element),
  }));

  // дефолты для field (без «жёсткой» структуры — оставляем гибкость)
  const f = cfg.field ?? {};
  cfg.field = {
    bg: f.bg ?? "#F9EDD6",
    line: f.line ?? "#B0846A",
    rows: f.rows ?? 4,
    widthRatio: f.widthRatio ?? 0.35,
    padding: {
      left: 80,
      right: 40,
      top: 40,
      bottom: 120,
      ...(f.padding ?? {}),
    },
    lineInsetTop: f.lineInsetTop ?? 14,
    lineInsetBottom: f.lineInsetBottom ?? 14,
    lineThickness: f.lineThickness ?? 3,
    lineStep: f.lineStep, // может быть undefined — тогда авто‑шаг
  };
}

function resetSession() {
  if (!cfg) return;

  playerHp = cfg.player.hp;
  hitsLeft = cfg.player.hits;

  enemies = [];

  // переносим миньонов из конфига в состояние рендера
  for (const m of cfg.minions) {
    enemies.push({
      id: m.id,
      kind: "minion",
      element: toElementKey(m.element),
      hp: m.hp,
      atk: m.atk,
      row: m.row ?? 2,
      col: m.col ?? 0.5,
      x: 0,
      y: 0,
      r: m.radius ?? 30,
      lineOffset: m.lineOffset ?? 0,
    });
  }

  // добавляем босса
  enemies.push({
    id: 999,
    kind: "boss",
    element: toElementKey(cfg.boss.element),
    hp: cfg.boss.hp,
    atk: cfg.boss.atk,
    row: cfg.boss.row ?? 4,
    col: cfg.boss.col ?? 0.5,
    x: 0,
    y: 0,
    r: cfg.boss.radius ?? 60,
    lineOffset: cfg.boss.lineOffset ?? 0,
  });

  layoutEnemies(); // перевод row/col → абсолютные x,y
  updateHud(); // обновляем текст в панельке над canvas
}

/* ──────────────────────────────────────────────────────────────────────────────
  ГЕОМЕТРИЯ ПОЛЯ
  - getFieldRect(): прямоугольник поля внутри canvas (с учётом widthRatio/padding)
  - getRowYs(): массив Y-координат линий (с lineInsetTop/Bottom и lineStep)
────────────────────────────────────────────────────────────────────────────── */
function getFieldRect() {
  // текущий размер canvas (фиксированный; можно вынести в cfg при желании)
  const W = 960,
    H = 540;

  const f = cfg!.field!; // к этому моменту normalizeConfig уже подставил дефолты

  const fieldW = Math.floor(W * clamp(f.widthRatio ?? 0.35, 0, 1));
  const fieldH = H - f.padding!.top - f.padding!.bottom;
  const fieldX = Math.floor((W - fieldW) / 2);
  const fieldY = f.padding!.top;

  return { fieldX, fieldY, fieldW, fieldH };
}

// расчёт Y‑координат линий: снизу вверх, равномерно или c явным шагом
function getRowYs(
  rows: number,
  rect: { fieldX: number; fieldY: number; fieldW: number; fieldH: number },
  field: FieldCfg
) {
  const insetTop = field.lineInsetTop ?? 14;
  const insetBottom = field.lineInsetBottom ?? 14;

  const usableH = rect.fieldH - insetTop - insetBottom;
  const rowsCount = Math.max(2, rows);

  // авто‑шаг (равномерно) и «принудительный» шаг, если задан в конфиге
  const stepAuto = usableH / (rowsCount - 1);
  const step = field.lineStep ? Math.min(field.lineStep, stepAuto) : stepAuto;

  const y0 = rect.fieldY + rect.fieldH - insetBottom; // нижняя линия
  return Array.from({ length: rowsCount }, (_, i) => y0 - i * step);
}

/* ──────────────────────────────────────────────────────────────────────────────
  РАЗМЕТКА СУЩЕСТВ (row/col → x,y)
  - rowIdx → берём Y линии
  - lineOffset → смещаем сверху/снизу относительно линии
  - ограничиваем по границам поля (с учётом радиуса)
────────────────────────────────────────────────────────────────────────────── */
function layoutEnemies() {
  if (!cfg) return;

  const rect = getFieldRect();
  const rows = Math.max(2, cfg.field!.rows ?? 5);
  const rowYs = getRowYs(rows, rect, cfg.field!);

  const xAt = (col: number) => rect.fieldX + clamp(col, 0, 1) * rect.fieldW;

  for (const e of enemies) {
    const rowIdx = clamp(e.row, 1, rows) - 1;
    const baseY = rowYs[rowIdx] + (e.lineOffset ?? 0);

    // не вылезаем из прямоугольника поля по Y
    const minY = rect.fieldY + e.r;
    const maxY = rect.fieldY + rect.fieldH - e.r;

    e.x = xAt(e.col);
    e.y = clamp(baseY, minY, maxY);
  }
}

/* ──────────────────────────────────────────────────────────────────────────────
  HUD (верхние надписи не на canvas) — краткая служебная инфа
────────────────────────────────────────────────────────────────────────────── */
function updateHud() {
  if (!cfg) return;
  const hpEl = document.getElementById("hp");
  if (hpEl)
    hpEl.textContent = `HP: ${playerHp}/${cfg.player.hpMax} | Ходы: ${hitsLeft}`;
  const ab = document.getElementById("ability");
  if (ab) ab.textContent = `Абилка: ${abilityIdx}`;
  const we = document.getElementById("weapon");
  if (we) we.textContent = `Оружие: ${weaponIdx}`;
}

/* ──────────────────────────────────────────────────────────────────────────────
  РЕНДЕР ОДНОГО КРУГА: подписи HP/ATK на самом кружке
  - у босса крупнее шрифт.
  - белый полу‑прозрачный обводочный контур для читаемости.
────────────────────────────────────────────────────────────────────────────── */
function drawEnemyBadge(s: p5, e: Enemy) {
  const isBoss = e.kind === "boss";
  const hpSize = isBoss ? 36 : 16;
  const atkSize = isBoss ? 18 : 10;
  const hpDy = isBoss ? -4 : -2; // маленький «центрирующий» сдвиг
  const atkDy = isBoss ? 22 : 12;

  s.textAlign(s.CENTER, s.CENTER);

  // тень под текст (лёгкий чёрный)
  s.noStroke();
  s.fill(0, 140);
  s.textSize(hpSize);
  s.text(String(e.hp), e.x + 1, e.y + hpDy + 1);
  s.textSize(atkSize);
  s.text(String(e.atk), e.x + 1, e.y + atkDy + 1);

  // основной слой: чёрный текст с полупрозрачным белым контуром
  s.stroke(255, 255, 255, 150);
  s.strokeWeight(isBoss ? 1.2 : 1.0);
  s.fill(20);
  s.textSize(hpSize);
  s.text(String(e.hp), e.x, e.y + hpDy);
  s.textSize(atkSize);
  s.text(String(e.atk), e.x, e.y + atkDy);
}

/* ──────────────────────────────────────────────────────────────────────────────
  P5 СЦЕНА: setup/draw/интерактив
  - рисуем поле, линии и подписи «1..N» слева;
  - рисуем все круги (с выделением при наведении);
  - рисуем HP‑линию игрока внизу;
  - лёгкая «болтанка» оружия как плейсхолдер.
────────────────────────────────────────────────────────────────────────────── */
const sketch = (s: p5) => {
  const W = 960,
    H = 540;
  let t = 0;
  let hoveredId: number | null = null;

  s.setup = () => {
    const c = s.createCanvas(W, H);
    c.parent("canvas-wrap");
    s.frameRate(60);
  };

  s.draw = () => {
    s.background(24);

    if (!cfg) {
      s.fill(200);
      s.textAlign(s.CENTER, s.CENTER);
      s.text("loading…", W / 2, H / 2);
      return;
    }

    const { fieldX, fieldY, fieldW, fieldH } = getFieldRect();
    const rows = Math.max(2, cfg.field!.rows ?? 5);
    const rowYs = getRowYs(
      rows,
      { fieldX, fieldY, fieldW, fieldH },
      cfg.field!
    );

    // фон поля
    s.noStroke();
    s.fill(cfg.field!.bg!);
    s.rect(fieldX, fieldY, fieldW, fieldH, 10);

    // горизонтальные линии + цифры слева
    s.stroke(cfg.field!.line!);
    s.strokeWeight(cfg.field!.lineThickness ?? 3);
    s.textAlign(s.RIGHT, s.CENTER);
    s.fill(cfg.field!.line!);
    for (let r = 1; r <= rows; r++) {
      const y = rowYs[r - 1];
      s.line(fieldX, y, fieldX + fieldW, y);
      s.textSize(18);
      s.text(String(r), fieldX - 8, y);
    }

    // КРУГИ
    for (const e of enemies) {
      // сам круг
      s.noStroke();
      s.fill(ELEMENT_COLOR[e.element]);
      s.circle(e.x, e.y, e.r * 2);

      // подсветка наведённого круга (серое + белое полупрозрачное кольцо)
      if (hoveredId === e.id) {
        s.noFill();
        s.stroke(100);
        s.strokeWeight(3);
        s.circle(e.x, e.y, e.r * 2 + 6);
        s.noStroke();
      }

      // подписи HP/ATK
      drawEnemyBadge(s, e);
      (window as any).__fieldRect = { fieldX, fieldY, fieldW, fieldH };
      drawPlayerHpBar(s, cfg);
    }

    // полоса HP игрока (оранжевая линия внизу)
    s.noFill();
    s.stroke("#ff9900");
    s.strokeWeight(6);
    const hpPct = Math.max(0, Math.min(1, playerHp / cfg.player.hpMax));
    s.line(40, H - 40, 40 + hpPct * (W - 80), H - 40);

    // болтающееся «оружие» — чисто для визуального оживления
    s.noStroke();
    s.fill("#ddd");
    const ox = 40 + Math.sin(t) * 6,
      oy = H - 80 + Math.cos(t * 0.7) * 4;
    s.rect(ox, oy, 24, 8, 4);
    t += 0.08;
  };

  // наведение мыши — для подсветки круга
  s.mouseMoved = () => {
    hoveredId = null;
    for (const e of enemies) {
      const d = Math.hypot(s.mouseX - e.x, s.mouseY - e.y);
      if (d <= e.r) {
        hoveredId = e.id;
        break;
      }
    }
  };

  // будущая точка входа для «атаки по клику»
  s.mousePressed = () => {
    if (!hoveredId) return;
    // TODO: здесь будет логика удара по цели hoveredId
  };
};

/* ──────────────────────────────────────────────────────────────────────────────
  ЗАПУСК СЦЕНЫ + UI‑события
  - загружаем config.json;
  - создаём canvas;
  - подписываемся на кнопки: restart и загрузка произвольного конф. файла.
────────────────────────────────────────────────────────────────────────────── */
(async () => {
  await loadConfig();
  new p5(sketch);

  // «Обновить сессию» — перечитываем cfg из памяти
  document
    .getElementById("restart")
    ?.addEventListener("click", () => resetSession());

  // Загрузка произвольного config.json через <input type="file">
  const fileInput = document.getElementById("file") as HTMLInputElement | null;
  fileInput?.addEventListener("change", (ev) => {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    input.files[0].text().then((txt) => {
      cfg = JSON.parse(txt) as Cfg;
      normalizeConfig();
      resetSession();
    });
  });
})();
