import p5 from "p5";
import { drawHpStatus } from "./ui/hp_status";
import {
  drawWeaponPanel,
  handleWeaponClick,
  getSelectedWeapon,
  getWeaponIcon,
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
  setSelectedAbility,
  getSelectedAbility,
  isSuperAbilityEnabled,
} from "./ui/abilities";

/* ──────────────────────────────────────────────────────────────────────────────
   СТИХИИ И ВСПОМОГАТЕЛЬНОЕ
   - ElementKey: 4 стихии проекта.
   - ELEMENT_COLOR: цвет круга на поле.
   - toElementKey: нормализация значений из config.json (понимает новые earth/water
   ────────────────────────────────────────────────────────────────────────────── */
type ElementKey = "earth" | "fire" | "water" | "cosmos" | "none";
type AttackKey = "min" | "max";

const ELEMENT_COLOR: Record<ElementKey, string> = {
  earth: "#129447", // зелёный — земля
  fire: "#E53935", // красный — огонь
  water: "#1E88E5", // синий — вода
  cosmos: "#8E24AA", // фиолетовый — космос
  none: "#FFFFFF",
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
  earth: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  fire: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  water: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  cosmos: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  none: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
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
        attack: { min: 1, max: 10 },
        elements: { earth: 0.25, fire: 0.25, water: 0.25, cosmos: 0.25 },
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
        earth: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0, none: 1.0 },
        fire: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0, none: 1.0 },
        water: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0, none: 1.0 },
        cosmos: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0, none: 1.0 },
        none: { earth: 1.0, fire: 1.0, water: 1.0, cosmos: 1.0, none: 1.0 },
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

    barY = barY + 60; // чуть ниже полоски HP

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
    const selectedWeapon = getSelectedWeapon();
    const weaponImg = selectedWeapon
      ? getWeaponIcon(selectedWeapon.kind) ?? undefined
      : undefined;

    drawAbilityPanel(s, fieldX, barY, fieldW, { rule, weaponImg });
    barY += 90;

    drawPointAbilityPanel(s, {
      x: fieldX,
      y: barY,
      w: fieldW,
      playerElements: cfg.player.elements,
      debug: true,
    });
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

  // ─── ЛОГ ВЫБОРА (оружие/точечная/супер) ──────────────────────────────────────
  function logAbilityChoice(player: PlayerCfg, weapon: WeaponCfg) {
    const superId = getSelectedAbility(); // "ab5"|"ab6"|"ab7"|"ab8"| "ab0" | null
    const pointEl = getActiveElementFromPointAbility(); // "earth"|"fire"|"water"|"cosmos"|"none"
    const rule = weapon.retaliationRule ?? "t1";

    console.log(
      [
        "=== CHOICE ===",
        `Super: ${String(superId)}`,
        `PointEl: ${pointEl}`,
        `Weapon: id=${weapon.id}, rule=${rule}`,
        `Player atk=${player.attack.min}-${player.attack.max}, luck=${
          player.luck ?? 0
        }`,
      ].join(" | ")
    );
  }

  function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
  }

  function spendTurns(n: number) {
    // @ts-ignore
    hitsLeft = Math.max(0, (hitsLeft as number) - n);
    updateHud?.();
  }

  function applyDamage(target: Enemy, dmg: number) {
    target.hp = Math.max(0, target.hp - dmg);
  }

  function abilityPctFor(player: PlayerCfg, el: ElementKey) {
    if (el === "none") return 1;
    let v = player.elements?.[el] ?? 1;
    if (v > 1.001) v /= 100; // поддержка «84» → 0.84
    return v;
  }

  // единичный «удар» по одной цели, без лишней магии
  function computeSingleHit(
    player: PlayerCfg,
    weapon: WeaponCfg,
    target: Enemy,
    matrix: ElementMatrixCfg | undefined,
    element: ElementKey, // "none" для физики
    coefMul = 1.0, // например ослабление второго удара
    skipMatrix = false // если вдруг нужно выключить матрицу
  ) {
    const luck = player.luck ?? 0;

    const pct = abilityPctFor(player, element);
    const pureMin = Math.floor(player.attack.min * pct);
    const pureMax = Math.floor(player.attack.max * pct);

    const baseCoef = skipMatrix
      ? 1.0
      : getElemCoef(matrix ?? defaultElementMatrix, element, target.element);
    const coef = baseCoef * coefMul;

    const posIdx = Math.max(1, Math.min(4, target.row));
    const { missPct } = getMissForWeapon(weapon, posIdx, luck);

    const baseRoll = rollByLuck(pureMin, pureMax, luck);
    const { didCrit, critMul } = getCritFromLuck(luck);
    const rolledVsElem = Math.round(baseRoll * coef * critMul);
    const { didMiss } = getMissForWeapon(weapon, posIdx, luck);
    const finalDamage = didMiss ? 0 : rolledVsElem;

    console.log(
      [
        `HIT → tgt#${target.id} ${target.kind} el=${target.element} row=${target.row}`,
        `selEl=${element} (${(pct * 100).toFixed(0)}%)`,
        `pure=${pureMin}-${pureMax}`,
        `coef=×${coef.toFixed(3)} (base=×${baseCoef.toFixed(
          3
        )}, mul=×${coefMul.toFixed(3)})`,
        `roll=${baseRoll} ${didCrit ? "CRIT×2" : ""}`,
        `miss=${missPct.toFixed(1)}% → final=${finalDamage} ${
          didMiss ? "(MISS)" : "(HIT)"
        }`,
      ].join(" | ")
    );

    return { finalDamage };
  }

  // ─── ЕДИНАЯ ТОЧКА ВХОДА ДЛЯ ХИТА ─────────────────────────────────────────────
  /**
   * Универсальный удар.
   * ability:
   *  - "ab0"           → обычный (физика)
   *  - "point"         → точечный (обязателен opts.element)
   *  - "ab5"|"ab6"|"ab7" → супер-удары (стихия зашита: fire/earth/water)
   *  - "ab8"           → смена стихии (урон 0, нужно opts.element или циклим)
   *
   * opts:
   *  - element?: ElementKey         — активная стихия (для "point" и "ab8")
   *  - secondCoef?: number          — ослабление второго удара (по умолчанию 1)
   *  - ab8Cost?: number             — стоимость ходов для ab8 (по умолчанию 2)
   *  - cycleOrder?: ElementKey[]    — порядок для ab8, если element не задан
   */

  function performHit(
    player: PlayerCfg,
    weapon: WeaponCfg,
    elementMatrix: ElementMatrixCfg | null | undefined,
    target: Enemy,
    ability: "ab0" | "point" | "ab5" | "ab6" | "ab7" | "ab8",
    opts: {
      element?: ElementKey;
      secondCoef?: number;
      ab8Cost?: number;
      cycleOrder?: ElementKey[];
    } = {}
  ) {
    // Проверка на живую цель
    if (target.hp <= 0) {
      console.log(`Цель #${target.id} уже мертва`);
      return { type: "skip", reason: "target_dead" };
    }

    // Безопасная матрица
    const M: ElementMatrixCfg =
      elementMatrix ??
      (cfg?.elementMatrix as ElementMatrixCfg) ??
      defaultElementMatrix;

    // ── AB8: смена стихии (урон 0)
    if (ability === "ab8") {
      const ORDER = opts.cycleOrder ?? ["earth", "fire", "water", "cosmos"];
      const fromEl = target.element;
      let toEl: ElementKey;
      if (opts.element && opts.element !== "none") {
        toEl = opts.element;
      } else {
        const idx = ORDER.indexOf(fromEl);
        const nextIdx = (idx >= 0 ? idx + 1 : 0) % ORDER.length;
        toEl = ORDER[nextIdx] as ElementKey;
      }

      target.element = toEl;
      const cost = opts.ab8Cost ?? 2;
      spendTurns(cost);
      console.log(
        `AB8: #${target.id} ${fromEl}→${toEl} | урон=0 | ходы=-${cost}`
      );
      return { type: "ab8", from: fromEl, to: toEl, cost };
    }

    // ── Супер-удары с потенциальной второй целью
    if (ability === "ab5" || ability === "ab6" || ability === "ab7") {
      // зашитая стихия
      const superEl: ElementKey =
        ability === "ab5" ? "fire" : ability === "ab6" ? "earth" : "water";

      const results: number[] = [];

      // главная цель
      const r1 = computeSingleHit(player, weapon, target, M, superEl);
      applyDamage(target, r1.finalDamage);
      results.push(r1.finalDamage);

      // определяем вторую цель по правилу
      let second: Enemy | null = null;
      if (ability === "ab5") {
        const cand = enemies.filter((e) => e.id !== target.id && e.hp > 0);
        cand.sort(
          (a, b) =>
            Math.hypot(a.x - target.x, a.y - target.y) -
            Math.hypot(b.x - target.x, b.y - target.y)
        );
        second = cand[0] ?? null;
      } else if (ability === "ab6") {
        const same = enemies.filter(
          (e) => e.id !== target.id && e.hp > 0 && e.row === target.row
        );
        same.sort(
          (a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x)
        );
        second = same[0] ?? null;
      } else {
        // ab7
        const forward = enemies
          .filter(
            (e) =>
              e.id !== target.id &&
              e.hp > 0 &&
              e.row === target.row &&
              e.x > target.x
          )
          .sort((a, b) => a.x - target.x - (b.x - target.x));
        second = forward[0] ?? null;
      }

      if (second) {
        const coefMul = opts.secondCoef ?? 1.0; // можно передать <1, чтобы ослабить
        const r2 = computeSingleHit(
          player,
          weapon,
          second,
          M,
          superEl,
          coefMul
        );
        applyDamage(second, r2.finalDamage);
        results.push(r2.finalDamage);
      } else {
        console.log(`${ability}: второй цели нет`);
      }

      spendTurns(1);
      const total = results.reduce((s, x) => s + x, 0);
      console.log(`${ability}: total=${total} | ходы=-1`);
      return { type: ability, total, count: results.length };
    }

    // ── Точечный (обязателен opts.element) / Обычный
    if (ability === "point") {
      const el = opts.element ?? "none";
      const r = computeSingleHit(player, weapon, target, M, el);
      applyDamage(target, r.finalDamage);
      spendTurns(1);
      console.log(`POINT ${el}: dmg=${r.finalDamage} | ходы=-1`);
      return { type: "point", element: el, damage: r.finalDamage };
    } else {
      // "ab0"
      const r = computeSingleHit(player, weapon, target, M, "none");
      applyDamage(target, r.finalDamage);
      spendTurns(1);
      console.log(`AB0: dmg=${r.finalDamage} | ходы=-1`);
      return { type: "ab0", damage: r.finalDamage };
    }
  }

  // ─── Задел под ответ врага ───────────────────────────────────────────────────
  type EnemyResponseCtx = { reason: string; totalDamage?: number };

  function queueEnemyRetaliation(target: Enemy, ctx: EnemyResponseCtx) {
    // Здесь можно поставить флажок и обработать в draw() или сразу сделать ответ.
    // Пример заглушки:
    if (target.hp > 0) {
      console.log(
        `ENEMY RESPONSE queued: tgt#${target.id} reason=${ctx.reason}`
      );
      // TODO: реализовать контратаку врага, эффекты статусов, дебаффы, и т.п.
    }
  }

  // ─── Helper: базовый удар (AB0) без стихий ───────────────────────────────────
  function doBasicHit(player: PlayerCfg, weapon: WeaponCfg, enemy: Enemy) {
    const baseMin = player.attack.min;
    const baseMax = player.attack.max;
    const luck = player.luck ?? 0;

    // Окно урона без стихий
    const pureMin = baseMin;
    const pureMax = baseMax;

    // Промах и крит (как в формуле)
    const posIdx = Math.max(1, Math.min(4, enemy.row));
    const { missPct } = getMissForWeapon(weapon, posIdx, luck);
    const critPct = Math.floor(luck / 10);

    // Статический лог (как в DebugStats...):
    const staticLine = [
      "=== Подробный расчёт удара (AB0) ===",
      `Цель: #${enemy.id} (${enemy.kind}) elem=${enemy.element} row=${enemy.row}`,
      `Оружие: ${weapon.name} (id=${weapon.id})`,
      `База игрока: ${baseMin}-${baseMax}`,
      `Удача: ${luck} ⇒ крит=${critPct}%`,
      `Без стихий (coef=1): ${pureMin}-${pureMax}`,
      `Промах(pos=${posIdx}): ${missPct.toFixed(1)}%`,
    ].join(" | ");
    if (staticLine !== lastEnemyDebugStatic) {
      console.log(staticLine);
      lastEnemyDebugStatic = staticLine;
    }

    // Итог клика
    const baseRoll = rollByLuck(pureMin, pureMax, luck);
    const { didCrit, critMul } = getCritFromLuck(luck);
    const rolled = Math.round(baseRoll * critMul);

    const { didMiss } = getMissForWeapon(weapon, posIdx, luck);
    const finalDamage = didMiss ? 0 : rolled;
    const outcome = didMiss ? "МИМО" : "ПОПАЛ";
    const critTag = didCrit ? "КРИТ×2" : "без крита";

    console.log(
      `Ролл: base=${baseRoll} | ${critTag} | по цели=${rolled} | результат: ${outcome} (${finalDamage})`
    );

    return { finalDamage };
  }

  // ─── Отладочный точечный удар (ab1–ab4) ─────────────────────────────────────
  function DebugStatsPointHitAgainstEnemy(
    player: PlayerCfg,
    weapon: WeaponCfg,
    enemy: Enemy,
    matrix: ElementMatrixCfg
  ) {
    const baseMin = player.attack.min;
    const baseMax = player.attack.max;
    const luck = player.luck ?? 0;

    const ability = getActiveElementFromPointAbility(); // earth/fire/water/cosmos/none
    const abilityPct = ability === "none" ? 1 : player.elements?.[ability] ?? 1;

    const pureMin = Math.floor(baseMin * abilityPct);
    const pureMax = Math.floor(baseMax * abilityPct);

    const coef = getElemCoef(matrix, ability as ElementKey, enemy.element);
    const vsMin = Math.floor(pureMin * coef);
    const vsMax = Math.floor(pureMax * coef);

    const posIdx = Math.max(1, Math.min(4, enemy.row));
    const { missPct } = getMissForWeapon(weapon, posIdx, luck);
    const critPct = Math.floor(luck / 10);

    // ── Статический лог ──
    const staticLine = [
      "=== Подробный расчёт точечного удара (AB1–AB4) ===",
      `Цель: #${enemy.id} (${enemy.kind}) elem=${enemy.element} row=${enemy.row}`,
      `Оружие: ${weapon.name} (id=${weapon.id})`,
      `База игрока: ${baseMin}-${baseMax}`,
      `Выбранная стихия: ${ability} (${(abilityPct * 100).toFixed(0)}%)`,
      `Чистый урон: ${pureMin}-${pureMax}`,
      `Коэф(ability→enemy): ×${coef}`,
      `По цели (с учётом стихии): ${vsMin}-${vsMax}`,
      `Удача: ${luck} ⇒ крит=${critPct}%`,
      `Промах(pos=${posIdx}): ${missPct.toFixed(1)}%`,
    ].join(" | ");
    console.log(staticLine);

    // ── Итог клика ──
    const baseRoll = rollByLuck(pureMin, pureMax, luck);
    const { didCrit, critMul } = getCritFromLuck(luck);
    const rolledVsElem = Math.round(baseRoll * coef * critMul);
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
      pureMin,
      pureMax,
      vsMin,
      vsMax,
      missPct,
      critPct,
      baseRoll,
      didCrit,
      didMiss,
      finalDamage,
    };
  }

  // ─── Клик мыши ────────────────────────────────────────────────────────────────
  s.mousePressed = () => {
    // 1) Панель оружия
    const pickedWeaponId = handleWeaponClick(s.mouseX, s.mouseY);
    if (pickedWeaponId !== null) {
      selectedWeaponId = pickedWeaponId;
      console.log("Выбрано оружие с ID:", pickedWeaponId);

      const rule = getSelectedWeaponCfg()?.retaliationRule ?? "t1";
      const curSuper = getSelectedAbility();
      if (
        curSuper &&
        curSuper !== "ab0" &&
        !isSuperAbilityEnabled(rule as any, curSuper)
      ) {
        setSelectedAbility("ab0");
      }
      return;
    }

    // 2) Панель точечного удара
    const pickedPoint = handlePointAbilityClick(s.mouseX, s.mouseY);
    if (pickedPoint) {
      setSelectedAbility(null);
      console.log("Точечный удар:", pickedPoint);
      return;
    }

    // 3) Панель суперударов
    const pickedSuper = handleAbilityClick(s.mouseX, s.mouseY);
    if (pickedSuper) {
      setSelectedPointAbility("off");
      console.log("Суперудар:", pickedSuper);
      return;
    }

    // 4) Клик по врагу → единый ХИТ
    if (!hoveredId) return;
    const enemy = enemies.find((e) => e.id === hoveredId);
    if (!enemy || !cfg) return;

    const weapon = getSelectedWeaponCfg() ?? cfg.weapons?.[0] ?? null;
    if (!weapon) return;

    const superId = getSelectedAbility(); // "ab5"|"ab6"|"ab7"|"ab8"|"ab0"|null
    const pointEl = getActiveElementFromPointAbility(); // "earth"|"fire"|"water"|"cosmos"|"none"
    const elementMatrix = cfg?.elementMatrix || defaultElementMatrix;

    // Определяем тип атаки
    let abilityType: "ab0" | "point" | "ab5" | "ab6" | "ab7" | "ab8";
    let options: any = {};

    if (superId && superId !== "ab0") {
      abilityType = superId as "ab5" | "ab6" | "ab7" | "ab8";

      // Для AB8 может потребоваться элемент
      if (abilityType === "ab8" && pointEl !== "none") {
        options.element = pointEl;
      }
    } else if (pointEl !== "none") {
      abilityType = "point";
      options.element = pointEl;
    } else {
      abilityType = "ab0";
    }

    // Выполняем удар
    const result = performHit(
      cfg.player,
      weapon,
      elementMatrix,
      enemy,
      abilityType,
      options
    );

    // Обрабатываем результат
    console.log("Результат удара:", result);

    // Обновляем отображение
    updateHud();
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
      console.log("CFG luck =", cfg.player.luck);
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
  p.text(`${dbg.min} – ${dbg.max}`, x + 270, y + size / 2 - 8 + 55);
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
 * baseMin..baseMax = player.attack.min..max (из config.json)
 * abilityPct = player.elements[selectedElement] (0..1)
 * pure(min/max) = base(min/max) * abilityPct
 * critChance = luck/10 % (из ТЗ)
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

  const line = `PLAYER base=${atkMin}-${atkMax} | luck=${luck} (crit=${critChancePct.toFixed(
    1
  )}%) | + selected=${selectedElement}(${(abilityPctSel * 100).toFixed(
    0
  )}%) | + pure=${pureMinSel}-${pureMaxSel} | ALL[ ${parts.join(" | ")} ]`;

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
  // активная стихия берётся из панели Точечного удара (ab1..ab4) или "none" при off
  const ability = getActiveElementFromPointAbility(); // ElementKey

  // процент выбранной абилки (для "none" в player.elements записи нет → берём 1)
  const abilityPct = player.elements?.[ability] ?? 1;

  // «чистое» окно для выбранной абилки (без врага/матрицы/позиции)
  const pureMin = Math.floor(baseMin * abilityPct);
  const pureMax = Math.floor(baseMax * abilityPct);

  // коэффициент стихий ability→enemy.element (матрица из config.json)
  const coef =
    ability === "none" ? 1 : getElemCoef(matrix, ability, enemy.element);

  // // окно по цели (с учётом стихии)
  const vsMin = Math.floor(pureMin * coef);
  const vsMax = Math.floor(pureMax * coef);

  // шанс промаха оружия по позиции с учётом удачи (из weapons.*.miss в конфиге)
  const posIdx = Math.max(1, Math.min(4, enemy.row));
  const { missPct } = getMissForWeapon(weapon, posIdx, luck);

  // // шанс крита от удачи (из таблицы переменных)
  const critPct = Math.floor(luck / 10);

  // // ── статический протокол (печатаем только если вводные поменялись)
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
  const baseR = 0; // TODO: реализовать ролл
}

function DebugStatsBasicHitAgainstEnemy(
  player: PlayerCfg,
  weapon: WeaponCfg,
  enemy: Enemy
) {
  // 1) исходные данные (без стихий)
  const baseMin = player.attack.min;
  const baseMax = player.attack.max;
  const luck = player.luck ?? 0;

  // 2) чистое окно без стихий
  const pureMin = baseMin;
  const pureMax = baseMax;

  // 3) элементный коэффициент = 1 (стихии нет)
  const coef = 1.0;

  // ожидаемое окно "по цели" = то же самое
  const vsMin = pureMin;
  const vsMax = pureMax;

  // 4) промах по позиции + удача
  const posIdx = Math.max(1, Math.min(4, enemy.row));
  const { missPct } = getMissForWeapon(weapon, posIdx, luck);

  // 5) шанс крита от удачи
  const critPct = Math.floor(luck / 10);

  // — статический лог (печатаем только при изменении вводных)
  const staticLine = [
    "=== Подробный расчёт удара (AB0) ===",
    `Цель: #${enemy.id} (${enemy.kind}) elem=${enemy.element} row=${enemy.row}`,
    `Оружие: ${weapon.name} (id=${weapon.id})`,
    `База игрока: ${baseMin}-${baseMax}`,
    `Удача: ${luck} ⇒ крит=${critPct}%`,
    `Без стихий (coef=1): ${vsMin}-${vsMax}`,
    `Промах(pos=${posIdx}): ${missPct.toFixed(1)}%`,
  ].join(" | ");
  if (staticLine !== lastEnemyDebugStatic) {
    console.log(staticLine);
    lastEnemyDebugStatic = staticLine;
  }

  // — итог клика
  const baseRoll = rollByLuck(pureMin, pureMax, luck);
  const { didCrit, critMul } = getCritFromLuck(luck);
  const rolledVs = Math.round(baseRoll * coef * critMul);

  const { didMiss } = getMissForWeapon(weapon, posIdx, luck);
  const finalDamage = didMiss ? 0 : rolledVs;
  const outcome = didMiss ? "МИМО" : "ПОПАЛ";
  const critTag = didCrit ? "КРИТ×2" : "без крита";

  console.log(
    `Ролл: base=${baseRoll} | ${critTag} | по цели=${rolledVs} | результат: ${outcome} (${finalDamage})`
  );

  return {
    baseMin,
    baseMax,
    luck,
    pureMin,
    pureMax,
    coef,
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

// ─── AB5: Отскок (Огонь) — отладочный расчёт ─────────────────────────────────
function DebugStatsSuperAB5AgainstEnemy(
  player: PlayerCfg,
  weapon: WeaponCfg,
  primary: Enemy,
  allEnemies: Enemy[],
  matrix: ElementMatrixCfg
) {
  const baseMin = player.attack.min;
  const baseMax = player.attack.max;
  const luck = player.luck ?? 0;

  // Стихия зашита в ab5: fire
  const ability: ElementKey = "fire";
  const abilityPct = player.elements?.[ability] ?? 1;

  // Чистое окно по стихийности (без врага)
  const pureMin = Math.floor(baseMin * abilityPct);
  const pureMax = Math.floor(baseMax * abilityPct);

  // Выбор второй цели: ближайшая живая, не совпадающая с primary
  const candidates = allEnemies.filter((e) => e.id !== primary.id && e.hp > 0);
  let secondary: Enemy | null = null;
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const da = Math.hypot(a.x - primary.x, a.y - primary.y);
      const db = Math.hypot(b.x - primary.x, b.y - primary.y);
      return da - db;
    });
    secondary = candidates[0] ?? null;
  }

  // ── STATIC: заголовок
  const head = [
    "=== AB5 «Огонь: цель + ещё одна» — подробный расчёт ===",
    `База игрока: ${baseMin}-${baseMax}`,
    `Выбранная стихия: ${ability} (${(abilityPct * 100).toFixed(0)}%)`,
    `Чистый урон (base×el%): ${pureMin}-${pureMax}`,
    `Удача: ${luck} ⇒ крит=${Math.floor(luck / 10)}%`,
  ].join(" | ");
  console.log(head);

  // Helper для одного удара по конкретной цели
  const hitOne = (target: Enemy, tag: string) => {
    const coef = getElemCoef(matrix, ability, target.element); // ability→target.element
    const vsMin = Math.floor(pureMin * coef);
    const vsMax = Math.floor(pureMax * coef);

    const posIdx = Math.max(1, Math.min(4, target.row));
    const { missPct } = getMissForWeapon(weapon, posIdx, luck);

    // статический блок по цели
    console.log(
      [
        `— ${tag}: #${target.id} (${target.kind}) el=${target.element} row=${target.row}`,
        `Коэф(ability→enemy)=×${coef}`,
        `По цели (с учётом матрицы): ${vsMin}-${vsMax}`,
        `Промах(pos=${posIdx})=${missPct.toFixed(1)}%`,
      ].join(" | ")
    );

    // итог клика
    const baseRoll = rollByLuck(pureMin, pureMax, luck);
    const { didCrit, critMul } = getCritFromLuck(luck);
    const rolledVsElem = Math.round(baseRoll * coef * critMul);
    const { didMiss } = getMissForWeapon(weapon, posIdx, luck);

    const finalDamage = didMiss ? 0 : rolledVsElem;
    const outcome = didMiss ? "МИМО" : "ПОПАЛ";
    const critTag = didCrit ? "КРИТ×2" : "без крита";

    console.log(
      `Ролл[${tag}]: base=${baseRoll} | ${critTag} | по цели=${rolledVsElem} | результат: ${outcome} (${finalDamage})`
    );

    return { finalDamage, didMiss, didCrit, coef, baseRoll };
  };

  // Удар #1 — по выбранной цели
  const r1 = hitOne(primary, "цель");

  // Удар #2 — отскок (только если есть вторая цель; считаем независимо)
  if (secondary) {
    const r2 = hitOne(secondary, "отскок");
    return {
      primary: r1,
      secondary: r2,
      ability,
      abilityPct,
      pureMin,
      pureMax,
    };
  }

  return {
    primary: r1,
    secondary: null,
    ability,
    abilityPct,
    pureMin,
    pureMax,
  };
}

// ─── AB6: Разделение (Земля) — цель + сосед на линии ─────────────────────────
function DebugStatsSuperAB6AgainstEnemy(
  player: PlayerCfg,
  weapon: WeaponCfg,
  primary: Enemy,
  allEnemies: Enemy[],
  matrix: ElementMatrixCfg
) {
  const baseMin = player.attack.min;
  const baseMax = player.attack.max;
  const luck = player.luck ?? 0;

  // Стихия AB6: earth
  const ability: ElementKey = "earth";
  const abilityPct = player.elements?.[ability] ?? 1;

  // Чистое окно по стихийности (без врага)
  const pureMin = Math.floor(baseMin * abilityPct);
  const pureMax = Math.floor(baseMax * abilityPct);

  // Ищем ближайшего соседа на той же линии (row совпадает)
  const sameRow = allEnemies.filter(
    (e) => e.id !== primary.id && e.hp > 0 && e.row === primary.row
  );
  let neighbor: Enemy | null = null;
  if (sameRow.length > 0) {
    sameRow.sort(
      (a, b) => Math.abs(a.x - primary.x) - Math.abs(b.x - primary.x)
    );
    neighbor = sameRow[0] ?? null;
  }

  // Заголовок статического лога
  console.log(
    [
      "=== AB6 «Земля: цель + сосед на линии» — подробный расчёт ===",
      `База игрока: ${baseMin}-${baseMax}`,
      `Выбранная стихия: ${ability} (${(abilityPct * 100).toFixed(0)}%)`,
      `Чистый урон (base×el%): ${pureMin}-${pureMax}`,
      `Удача: ${luck} ⇒ крит=${Math.floor(luck / 10)}%`,
    ].join(" | ")
  );

  // Helper для удара по одной цели
  const hitOne = (target: Enemy, tag: string) => {
    const coef = getElemCoef(matrix, ability, target.element); // earth → target.element
    const vsMin = Math.floor(pureMin * coef);
    const vsMax = Math.floor(pureMax * coef);

    const posIdx = Math.max(1, Math.min(4, target.row));
    const { missPct } = getMissForWeapon(weapon, posIdx, luck);

    console.log(
      [
        `— ${tag}: #${target.id} (${target.kind}) el=${target.element} row=${target.row}`,
        `Коэф(ability→enemy)=×${coef}`,
        `По цели (с учётом матрицы): ${vsMin}-${vsMax}`,
        `Промах(pos=${posIdx})=${missPct.toFixed(1)}%`,
      ].join(" | ")
    );

    const baseRoll = rollByLuck(pureMin, pureMax, luck);
    const { didCrit, critMul } = getCritFromLuck(luck);
    const rolledVsElem = Math.round(baseRoll * coef * critMul);
    const { didMiss } = getMissForWeapon(weapon, posIdx, luck);

    const finalDamage = didMiss ? 0 : rolledVsElem;
    const outcome = didMiss ? "МИМО" : "ПОПАЛ";
    const critTag = didCrit ? "КРИТ×2" : "без крита";

    console.log(
      `Ролл[${tag}]: base=${baseRoll} | ${critTag} | по цели=${rolledVsElem} | результат: ${outcome} (${finalDamage})`
    );

    return { finalDamage, didMiss, didCrit, coef, baseRoll };
  };

  const r1 = hitOne(primary, "цель");
  let r2: ReturnType<typeof hitOne> | null = null;

  if (neighbor) {
    r2 = hitOne(neighbor, "сосед");
  } else {
    console.log(
      "— сосед на той же линии не найден; второй удар не применяется."
    );
  }

  return {
    primary: r1,
    secondary: r2,
    ability,
    abilityPct,
    pureMin,
    pureMax,
  };
}

// ─── AB7: Проникновение (Вода) — цель + следующая позиция по линии ───────────
function DebugStatsSuperAB7AgainstEnemy(
  player: PlayerCfg,
  weapon: WeaponCfg,
  primary: Enemy,
  allEnemies: Enemy[],
  matrix: ElementMatrixCfg,
  penetrateCoef = 1.0 // при необходимости можно, например, 0.8
) {
  const baseMin = player.attack.min;
  const baseMax = player.attack.max;
  const luck = player.luck ?? 0;

  // Стихия AB7: water
  const ability: ElementKey = "water";
  const abilityPct = player.elements?.[ability] ?? 1;

  // Чистое окно с учётом процента стихии
  const pureMin = Math.floor(baseMin * abilityPct);
  const pureMax = Math.floor(baseMax * abilityPct);

  // Ищем «следующую позицию» на той же линии: ближайший живой враг с X больше
  const sameRowForward = allEnemies
    .filter(
      (e) =>
        e.id !== primary.id &&
        e.hp > 0 &&
        e.row === primary.row &&
        e.x > primary.x
    )
    .sort((a, b) => a.x - primary.x - (b.x - primary.x));

  const secondary: Enemy | null = sameRowForward[0] ?? null;

  console.log(
    [
      "=== AB7 «Вода: цель + след. позиция» — подробный расчёт ===",
      `База игрока: ${baseMin}-${baseMax}`,
      `Стихия: ${ability} (${(abilityPct * 100).toFixed(0)}%)`,
      `Чистый (base×el%): ${pureMin}-${pureMax}`,
      `Удача: ${luck} ⇒ крит=${Math.floor(luck / 10)}%`,
      secondary
        ? `Найдена след. позиция: #${secondary.id} на row=${
            secondary.row
          }, x=${secondary.x.toFixed(1)}`
        : "Следующая позиция по линии не найдена — удар только по цели",
    ].join(" | ")
  );

  // Helper: один удар по цели
  const hitOne = (target: Enemy, tag: string, coefMul = 1.0) => {
    const coef = getElemCoef(matrix, ability, target.element) * coefMul; // water→target.element × penetrateCoef
    const vsMin = Math.floor(pureMin * coef);
    const vsMax = Math.floor(pureMax * coef);

    const posIdx = Math.max(1, Math.min(4, target.row));
    const { missPct } = getMissForWeapon(weapon, posIdx, luck);

    console.log(
      [
        `— ${tag}: #${target.id} (${target.kind}) el=${target.element} row=${target.row}`,
        `Коэф(ability→enemy)=×${coef.toFixed(3)}`,
        `По цели: ${vsMin}-${vsMax}`,
        `Промах(pos=${posIdx})=${missPct.toFixed(1)}%`,
      ].join(" | ")
    );

    const baseRoll = rollByLuck(pureMin, pureMax, luck);
    const { didCrit, critMul } = getCritFromLuck(luck);
    const rolledVsElem = Math.round(baseRoll * coef * critMul);
    const { didMiss } = getMissForWeapon(weapon, posIdx, luck);

    const finalDamage = didMiss ? 0 : rolledVsElem;
    const outcome = didMiss ? "МИМО" : "ПОПАЛ";
    const critTag = didCrit ? "КРИТ×2" : "без крита";

    console.log(
      `Ролл[${tag}]: base=${baseRoll} | ${critTag} | по цели=${rolledVsElem} | результат: ${outcome} (${finalDamage})`
    );

    return { finalDamage, didMiss, didCrit, coef, baseRoll };
  };

  // Удар #1 — по выбранной цели
  const r1 = hitOne(primary, "цель", 1.0);

  // Удар #2 — «проникновение» в следующую позицию по линии (если есть)
  let r2: ReturnType<typeof hitOne> | null = null;
  if (secondary) {
    r2 = hitOne(secondary, "проникновение", penetrateCoef);
  }

  return {
    primary: r1,
    secondary: r2,
    ability,
    abilityPct,
    pureMin,
    pureMax,
    penetrateCoef,
  };
}

// ─── AB8: Смена стихии цели (урон 0, −2 хода) ────────────────────────────────
function DebugStatsSuperAB8AgainstEnemy(
  player: PlayerCfg,
  enemy: Enemy,
  desiredEl: ElementKey // "earth"|"fire"|"water"|"cosmos"|"none"
) {
  const ORDER: ElementKey[] = ["earth", "fire", "water", "cosmos"];
  const fromEl: ElementKey = enemy.element;

  let toEl: ElementKey;
  if (desiredEl !== "none") {
    toEl = desiredEl;
  } else {
    const idx = ORDER.indexOf(fromEl);
    const nextIdx = (idx >= 0 ? idx + 1 : 0) % ORDER.length; // ← ФИКС
    toEl = ORDER[nextIdx];
  }

  console.log(
    [
      "=== AB8 «Смена стихии цели» ===",
      `Цель: #${enemy.id} (${enemy.kind}) row=${enemy.row}`,
      `Было: ${fromEl} → Станет: ${toEl}`,
      "Урон: 0",
      "Цена: −2 хода",
    ].join(" | ")
  );

  // Применяем изменение стихии
  enemy.element = toEl;

  // Списываем 2 хода (если есть счётчик)
  if (typeof hitsLeft === "number") {
    // @ts-ignore
    hitsLeft = Math.max(0, (hitsLeft as number) - 2);
  }
  // HUD обновим сразу
  updateHud?.();
}
