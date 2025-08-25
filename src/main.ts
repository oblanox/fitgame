import p5 from "p5";
import { drawHpStatus } from "./ui/hp_status";
import {
  drawWeaponPanel,
  handleWeaponClick,
  getSelectedWeapon,
  preloadWeaponIcons,
  Weapon,
  getWeapons,
} from "./ui/weapons";
import {
  drawPointAbilityPanel,
  handlePointAbilityClick,
  getActiveElementFromPointAbility,
  setSelectedPointAbility,
} from "./ui/elements";
import { drawPanelBg } from "@ui/common";
import { drawPlayerStats } from "./ui/player_stats";
import { drawElementSchema, preloadElementSchema } from "@ui/element_schemes";
import {
  drawAbilityPanel,
  handleAbilityClick,
  getSelectedAbility,
  setSelectedAbility
} from "./ui/abilities";

/* ──────────────────────────────────────────────────────────────────────────────
  СТИХИИ И ВСПОМОГАТЕЛЬНОЕ
  - ElementKey: 4 стихии проекта.
  - ELEMENT_COLOR: цвет круга на поле.
  - toElementKey: нормализация значений из config.json
    (понимает новые earth/water .
────────────────────────────────────────────────────────────────────────────── */
type ElementKey = "earth" | "fire" | "water" | "cosmos";
type AttackKey = "min" | "max";

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

type PlayerCfg = {
  hpMax: number;
  hp: number;
  hits: number;
  luck: number;
  def: number;
  maxHits: number;
  elements?: Partial<Record<ElementKey, number>>;
  attack: Record<AttackKey, number>;
};

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

type WeaponCfg = {
  id: number;
  name: string;
  miss: {
    baseByPos: number[]; // [0, 0, 0, 0] или [15, 30, 45, 60] — массив из 4 чисел
    luckStep: number;
    luckPerStepPct: number;
  };
  retaliationRule: "t1" | "t2" | "t3";
};

type ElementMatrixCfg = Record<ElementKey, Record<ElementKey, number>>;

const defaultElementMatrix: ElementMatrixCfg = {
  earth: { earth: 1, fire: 1, water: 1, cosmos: 1 },
  fire: { earth: 1, fire: 1, water: 1, cosmos: 1 },
  water: { earth: 1, fire: 1, water: 1, cosmos: 1 },
  cosmos: { earth: 1, fire: 1, water: 1, cosmos: 1 },
};

type Cfg = {
  field?: FieldCfg;
  player: PlayerCfg;
  boss: BossCfg;
  minions: MinionCfg[];
  weapons: WeaponCfg[];
  elementMatrix?: ElementMatrixCfg;
};

/* ──────────────────────────────────────────────────────────────────────────────
  СОСТОЯНИЕ ВИЗУАЛИЗАЦИИ
  - cfg: текущая конфигурация (из /public/config.json или загруженная файлом).
  - enemies: подготовленные к рендеру сущности (миньоны + босс).
────────────────────────────────────────────────────────────────────────────── */
let cfg: Cfg | null = null;

let selectedWeaponId: number = 1;

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
      player: {
        hpMax: 2200,
        hp: 2200,
        hits: 60,
        luck: 1,
        def: 1,
        maxHits: 60,
        attack: {
          min: 1,
          max: 10,
        },
        elements: {
          earth: 0.25,
          fire: 0.25,
          water: 0.25,
          cosmos: 0.25,
        },
      },
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
      weapons: [],
      elementMatrix: {
        earth: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0 },
        fire: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0 },
        water: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0 },
        cosmos: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0 },
      },
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
const selectedIcons: Record<number, p5.Image> = {};

const sketch = (s: p5) => {
  const W = 960,
    H = 1400;
  let t = 0;
  let hoveredId: number | null = null;

  function preloadWeaponSelected(p: p5) {
    selectedIcons[1] = p.loadImage("assets/icon_weapon_selected_1.png");
    selectedIcons[2] = p.loadImage("assets/icon_weapon_selected_2.png");
    selectedIcons[3] = p.loadImage("assets/icon_weapon_selected_3.png");
  }

  s.setup = () => {
    const c = s.createCanvas(W, H);
    c.parent("canvas-wrap");
    s.frameRate(60);
    preloadWeaponIcons(s);
    preloadWeaponSelected(s);
    preloadElementSchema(s);
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
    s.rect(fieldX, fieldY, fieldW, fieldH, 0);

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
    }

    let barY = fieldH;
    const weaponY = barY;
    drawPanelBg(s, fieldX, barY, fieldW, 750, cfg.field?.bg);

    drawHpStatus(s, fieldX, barY, fieldW, {
      hp: cfg.player.hp,
      hpMax: cfg.player.hpMax,
    });

    barY = barY + 60;
    // чуть ниже полоски HP
    //const weaponW = Math.floor(fieldW * 0.7);
    //const weaponX = fieldX + (fieldW - weaponW) / 2;
    drawWeaponPanel(
      s,
      {
        weapons: getWeapons(cfg),
        selectedId: getSelectedWeapon()?.id ?? 1,
      },
      {
        x: fieldX + 12,
        y: barY,
      }
    );
    drawSelectedWeaponIcon(s, fieldX, weaponY);
    barY += 60;

    const rule = getSelectedWeaponCfg()?.retaliationRule ?? "t1";
    const weaponImg = selectedIcons[getSelectedWeaponCfg()?.id ?? 1];
    drawAbilityPanel(s, fieldX, barY, fieldW, {
      rule,
      weaponTile: {
        img: weaponImg,
        min: cfg.player.attack.min,
        max: cfg.player.attack.max,
      },
    });
    barY += 90;

    drawPointAbilityPanel(s, {
      x: fieldX,
      y: barY,
      w: fieldW,
      playerElements: cfg.player.elements,
    });
    barY += 80;

    barY += 80;

    drawPlayerStats(
      s,
      fieldX,
      barY,
      fieldW,
      hitsLeft,
      cfg.player.hits,
      cfg.player.hp,
      cfg.player.hpMax,
      cfg.player.attack.min,
      cfg.player.attack.max,
      cfg.player.def ?? 0,
      cfg.player.luck ?? 0
    );

    barY += 130;
    if (cfg.elementMatrix) {
      drawElementSchema(s, fieldX, barY, fieldW, cfg.elementMatrix);
    }
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
  // будущая точка входа для «атаки по клику»
  s.mousePressed = () => {
    // 1) Панель оружия
    const pickedWeaponId = handleWeaponClick(s.mouseX, s.mouseY);
    if (pickedWeaponId !== null) {
      selectedWeaponId = pickedWeaponId;
      console.log("Выбрано оружие с ID:", pickedWeaponId);
      return; // стопим дальнейшую обработку
    }

    // 2) точечный удар
    const pickedPoint = handlePointAbilityClick(s.mouseX, s.mouseY);
    if (pickedPoint) {
      setSelectedAbility(null); // сброс суперудара
      console.log("Точечный удар:", pickedPoint);
      return;
    }

    // 3) суперудары
    const pickedSuper = handleAbilityClick(s.mouseX, s.mouseY);
    if (pickedSuper) {
      console.log("Суперудар:", pickedSuper);
      return;
    }

    // 4) Клик по врагу → подробный расчёт урона (лог “статический” + “итог клика”)
    if (!hoveredId) return;

    const enemy = enemies.find((e) => e.id === hoveredId);
    if (!enemy || !cfg) return;

    // берём текущее оружие из конфига по selectedWeaponId
    const weapon = getSelectedWeaponCfg() ?? cfg.weapons?.[0] ?? null;
    if (!weapon) return;

    DebugStatsPlayerDamageAgainstEnemy(
      cfg.player,
      weapon,
      enemy,
      cfg.elementMatrix ?? defaultElementMatrix
    );
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

function getSelectedWeaponCfg(): WeaponCfg | null {
  if (!cfg?.weapons) return null;
  return cfg.weapons.find((w) => w.id === selectedWeaponId) ?? null;
}

function drawSelectedWeaponIcon(p: p5, x: number, y: number, size = 64) {
  if (!cfg?.weapons || !cfg.weapons.length) return;

  const weapon =
    cfg.weapons.find((w) => w.id === selectedWeaponId) ?? cfg.weapons[0];
  if (!weapon) return;

  // Плавающая иконка (лёгкая анимация)
  const dy = Math.sin(p.frameCount / 10) * 1.5;
  const img = selectedIcons[weapon.id];
  p.image(img, x + 260, y - 40 + dy, 64, 120);

  // Урон
  // Чистый урон (точечный удар стихией или off)
  const selectedEl = getActiveElementFromPointAbility(); // <-- из новой панели точечного удара
  const dbg = DebugStatsPlayerDamage(cfg.player, selectedEl);
  p.fill(0);
  p.textSize(14);
  p.textAlign(p.LEFT, p.TOP);
  p.text(`Чистый: ${dbg.min} – ${dbg.max}`, x + 240, y + size / 2 - 8 + 55);
}

// main.ts

// ─── Игрок: компактный анти‑спам лог ──────────────────────────────────────────
let lastPlayerDebugLine = "";

// Порядок стихий как в проекте:
const ELEMENTS_4: ElementKey[] = ["earth", "fire", "water", "cosmos"];

/**
 * DebugStatsPlayerDamage — считает «чистый» мин/макс для выбранной абилки,
 * и одновременно готовит ОДНУ строку с диапазонами по КАЖДОЙ стихии (без матрицы).
 * Никаких коэффициентов врага тут нет — это лог ИГРОКА.
 *
 * Формулы:
 *   baseMin..baseMax = player.attack.min..max   (из config.json)
 *   abilityPct = player.elements[selectedElement]  (0..1)
 *   pure(min/max) = base(min/max) * abilityPct
 *   critChance = luck/10 % (из ТЗ)
 *
 * Возвращает «чистый» диапазон для выбранной абилки (для вывода под оружием).
 * В консоль печатает ОДНУ строку, если что‑то изменилось.
 */
function DebugStatsPlayerDamage(
  player: PlayerCfg,
  selectedElement: ElementKey
) {
  const atkMin = player.attack.min;
  const atkMax = player.attack.max;
  const luck = player.luck ?? 0;
  const critChancePct = luck / 10; // каждые 10 удачи = +1% крита (из ТЗ)

  // Чистый диапазон для выбранной абилки (без матрицы)
  const abilityPctSel = player.elements?.[selectedElement] ?? 1;
  const pureMinSel = Math.floor(atkMin * abilityPctSel);
  const pureMaxSel = Math.floor(atkMax * abilityPctSel);

  // Чистые диапазоны по всем 4 стихиям (без матрицы) — для лога
  const parts: string[] = [];
  for (const el of ELEMENTS_4) {
    const pct = player.elements?.[el] ?? 1;
    const dmin = Math.floor(atkMin * pct);
    const dmax = Math.floor(atkMax * pct);
    parts.push(`${el}=${dmin}-${dmax}`);
  }

  const line =
    `PLAYER base=${atkMin}-${atkMax} | luck=${luck} (crit=${critChancePct.toFixed(
      1
    )}%) | ` +
    `selected=${selectedElement}(${(abilityPctSel * 100).toFixed(0)}%) | ` +
    `pure=${pureMinSel}-${pureMaxSel} | ALL[ ${parts.join(" | ")} ]`;

  if (line !== lastPlayerDebugLine) {
    // console.clear(); // при желании можно чистить, чтобы была только актуальная строка
    console.log(line);
    lastPlayerDebugLine = line;
  }

  return { min: pureMinSel, max: pureMaxSel };
}

// ─── Luck / Crit / Miss helpers ──────────────────────────────────────────────

// смещение ролла к максимуму: удача 0..100 → экспонента 1..0.3
function rollByLuck(minVal: number, maxVal: number, luck: number): number {
  const L = Math.max(0, Math.min(1, luck / 100));
  const exp = Math.max(0.3, 1 - 0.7 * L); // больше удачи → сильнее «прижатие» к max
  const u = Math.random() ** exp; // смещённое равномерное 0..1
  return Math.round(minVal + (maxVal - minVal) * u);
}

// шанс крита: ⌊luck/10⌋ %, множитель ×2 (из таблицы переменных)
function getCritFromLuck(luck: number) {
  const pct = Math.floor(luck / 10);
  const did = Math.random() * 100 < pct;
  return { critPct: pct, didCrit: did, critMul: did ? 2 : 1 };
}

// шанс промаха по оружию и позиции с учётом удачи (конфиг weapons.miss)
function getMissForWeapon(weapon: WeaponCfg, pos1to4: number, luck: number) {
  const base =
    weapon.miss?.baseByPos?.[Math.max(1, Math.min(4, pos1to4)) - 1] ?? 0;
  const step = weapon.miss?.luckStep ?? 10;
  const per = weapon.miss?.luckPerStepPct ?? 1;
  const steps = Math.floor(luck / step);
  const missPct = Math.max(0, Math.min(100, base - steps * per));
  const didMiss = Math.random() * 100 < missPct;
  return { missPct, didMiss };
}

// элементный коэффициент attacker→defender (дефолт 1.0)
function getElemCoef(
  matrix: ElementMatrixCfg | undefined,
  atk: ElementKey,
  def: ElementKey
) {
  const M = matrix ?? defaultElementMatrix;
  return M[atk]?.[def] ?? 1.0;
}

// ─── Подробный лог урона по врагу ────────────────────────────────────────────
let lastEnemyDebugStatic = "";

function DebugStatsPlayerDamageAgainstEnemy(
  player: PlayerCfg,
  weapon: WeaponCfg,
  enemy: Enemy,
  matrix: ElementMatrixCfg
) {
  // 1) исходные данные
  const baseMin = player.attack.min; // из config.json player.attack
  const baseMax = player.attack.max; // (диапазон фиксированный)
  const luck = player.luck ?? 0; // из config.json player.luck
  const superId = getSelectedAbility?.() ?? null;
  const ability: ElementKey =
    superId === "weapon"
      ? "none" // плитка оружия → чистый удар без стихии
      : getActiveElementFromPointAbility();
  // процент выбранной абилки (для "none" в player.elements записи нет → берём 1)
  const abilityPct = player.elements?.[ability] ?? 1;

  // «чистое» окно для выбранной абилки (без врага/матрицы/позиции)
  const pureMin = Math.floor(baseMin * abilityPct);
  const pureMax = Math.floor(baseMax * abilityPct);

  // коэффициент стихий ability→enemy.element (матрица из config.json)
  const coef = getElemCoef(matrix, ability, enemy.element);

  // окно по цели (с учётом стихии)
  const vsMin = Math.floor(pureMin * coef);
  const vsMax = Math.floor(pureMax * coef);

  // шанс промаха оружия по позиции с учётом удачи (из weapons.*.miss в конфиге)
  const posIdx = Math.max(1, Math.min(4, enemy.row));
  const { missPct } = getMissForWeapon(weapon, posIdx, luck); //

  // шанс крита от удачи (из таблицы переменных)
  const critPct = Math.floor(luck / 10); //

  // ── статический протокол (печатаем только если вводные поменялись)
  const staticLine = [
    "=== Подробный расчёт удара ===",
    `Цель: #${enemy.id} (${enemy.kind}) elem=${enemy.element} row=${enemy.row}`,
    `Оружие: ${weapon.name} (id=${weapon.id})`,
    `База игрока: ${baseMin}-${baseMax}`,
    `Удача: ${luck} ⇒ крит=${critPct}%`,
    `Абилка: ${ability} (${(abilityPct * 100).toFixed(0)}%)`,
    `Чистый (base×ab%): ${pureMin}-${pureMax}`,
    `Коэф(ability→enemy): ×${coef}`,
    `По цели (с учётом стихии): ${vsMin}-${vsMax}`,
    `Промах(pos=${posIdx}): ${missPct.toFixed(1)}%`,
  ].join(" | ");

  if (staticLine !== lastEnemyDebugStatic) {
    console.log(staticLine);
    lastEnemyDebugStatic = staticLine;
  }

  // ── итог одного клика (всегда печатаем)
  // ролл по чистому окну с учётом удачи (min/max сами не двигаем)
  const baseRoll = rollByLuck(pureMin, pureMax, luck);

  // крит
  const { didCrit, critMul } = getCritFromLuck(luck);

  // применяем стихию и крит
  const rolledVsElem = Math.round(baseRoll * coef * critMul);

  // промах — финальная проверка
  const { didMiss } = getMissForWeapon(weapon, posIdx, luck);

  const finalDamage = didMiss ? 0 : rolledVsElem;
  const outcome = didMiss ? "МИМО" : "ПОПАЛ";
  const critTag = didCrit ? "КРИТ×2" : "без крита";

  console.log(
    `Ролл: base=${baseRoll} | ${critTag} | по цели=${rolledVsElem} | результат: ${outcome} (${finalDamage})`
  );

  return {
    ability,
    abilityPct,
    coef,
    baseMin,
    baseMax,
    pureMin,
    pureMax,
    vsMin,
    vsMax,
    missPct,
    critPct,
    posIdx,
    baseRoll,
    didCrit,
    didMiss,
    finalDamage,
  };
}
