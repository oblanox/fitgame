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
import { initGameLogger, drawLogPanel, gameLog } from "./ui/log_panel";

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

/* ПОЛЯ АНИМАЦИЯ И ЭФФЕКТОВ */

/* ────────────────────────────────────────────────────────────────────────────
   Ответка врага: «опускаем целиком врага к полоске HP → красный всплеск → назад»
   — без изменения типов Enemy и Cfg
   — состояние анимации хранится в WeakMap
   — всплеск рисуем отдельным оверлеем (вызывается после drawHpStatus)
──────────────────────────────────────────────────────────────────────────── */

type RetaliationRule = "t1" | "t2" | "t3";

type EnemyAnimState = {
  phase: "down" | "hit" | "up";
  t0: number;
  downMs: number; // спуск к HP
  hitMs: number; // удержание + нанесение урона в конце
  upMs: number; // возврат
  startY: number; // стартовая Y врага (мировая/экранная)
  targetY: number; // целевая Y (якорь HP)
  dmgApplied: boolean;
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

const animByEnemy = new WeakMap<Enemy, EnemyAnimState>();

// ── вспомогательные состояния
const nowMs = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function easeInOutQuad(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeOutBack(t: number) {
  t = Math.max(0, Math.min(1, t));
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* ─────────────────────────── HP-якорь и всплески ─────────────────────────── */

let hpBarY = 0;
let hpBarSet = false;

// был export function setHpAnchor(x, y)
export function setHpBarY(y: number) {
  hpBarY = y;
  hpBarSet = true;
}

/** Красный всплеск на HP */
type HpImpact = {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t0: number;
  ms: number;
};
const hpImpacts: HpImpact[] = [];

/** Вызови каждый кадр ПОСЛЕ drawHpStatus(p, cfg) */
export function drawHpImpactOverlay(p: p5) {
  const t = nowMs();
  for (let i = hpImpacts.length - 1; i >= 0; --i) {
    const it = hpImpacts[i];
    const k = Math.min(1, (t - it.t0) / it.ms);
    const r = it.r0 + (it.r1 - it.r0) * easeOutBack(k);
    const a = 1 - k;

    p.push();
    p.noFill();
    p.stroke(255, 0, 0, 255 * a);
    p.strokeWeight(3);
    p.circle(it.x, it.y, r * 2);
    p.pop();

    if (k >= 1) hpImpacts.splice(i, 1);
  }
}

/* ────────────────────────── Смещение врага по Y ──────────────────────────── */

export function getEnemyYOffset(e: Enemy): number {
  return Number((e as any).yOffset ?? 0) || 0;
}
function setEnemyYOffset(e: Enemy, yOff: number) {
  (e as any).yOffset = yOff || 0;
}

/* ───────────────────── Контрудар: очередь и анимация ────────────────────── */

/** Запусти ответки. Правило: "t1" цель; "t2" цель+сосед; "t3" вся линия. */
export function queueEnemyRetaliationToHp(
  cfg: Cfg,
  target: Enemy,
  all: Enemy[],
  ctx: { reason: string; totalDamage?: number },
  rule: RetaliationRule = "t1"
) {
  if (!cfg?.player || !target || target.hp <= 0) return;

  // выбираем кандидатов
  const row = Number((target as any).row ?? 1);
  let list: Enemy[] = [];
  switch (rule) {
    case "t1":
      list = [target];
      break;
    case "t2": {
      list = [target];
      const sameRow = all
        .filter(
          (e) =>
            e !== target && e.hp > 0 && Number((e as any).row ?? row) === row
        )
        .sort(
          (a, b) =>
            Math.abs((a as any).col - (target as any).col) -
            Math.abs((b as any).col - (target as any).col)
        );
      if (sameRow[0]) list.push(sameRow[0]);
      break;
    }
    case "t3":
      list = all.filter(
        (e) => e.hp > 0 && Number((e as any).row ?? row) === row
      );
      break;
  }
  // не дублировать занятых
  list = list.filter((e) => !animByEnemy.get(e));

  const rules: any = (cfg as any).rules ?? {};
  const gap = Number(rules.chainGapMs ?? 120);

  list.forEach((e, i) => {
    setTimeout(() => startEnemyDiveToHp(cfg, e, ctx), i * gap);
  });
}

/** Анимация: опускаем врага до hpAnchor → всплеск → возвращаем обратно */
function startEnemyDiveToHp(
  cfg: Cfg,
  enemy: Enemy,
  ctx: { reason: string; totalDamage?: number }
) {
  if (enemy.hp <= 0 || animByEnemy.get(enemy)) return;

  // Если якорь HP ещё не известен — делаем короткий «кивок» на месте.
  const hasHp = hpBarSet;

  const rules: any = (cfg as any).rules ?? {};
  const downMs = hasHp ? Number(rules.outMs ?? 240) : 140;
  const hitMs = Number(rules.hitMs ?? 120);
  const upMs = hasHp ? Number(rules.backMs ?? 260) : 160;

  const startY = Number((enemy as any).y ?? 0);
  const targetY = hpBarSet ? hpBarY : startY + Number(rules.dropPx ?? 26);

  const st: EnemyAnimState = {
    phase: "down",
    t0: nowMs(),
    downMs,
    hitMs,
    upMs,
    startY,
    targetY,
    dmgApplied: false,
  };
  animByEnemy.set(enemy, st);
  requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
}

function animTickDive(
  cfg: Cfg,
  enemy: Enemy,
  ctx: { reason: string; totalDamage?: number }
) {
  const st = animByEnemy.get(enemy);
  if (!st) return;

  const t = nowMs();

  if (st.phase === "down") {
    const k = Math.min(1, (t - st.t0) / st.downMs);
    const y = lerp(st.startY, st.targetY, easeInOutQuad(k));
    setEnemyYOffset(enemy, y - st.startY);

    if (k < 1) {
      requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
      return;
    }

    // дошли до HP — удар через «всплеск»
    st.phase = "hit";
    st.t0 = t;

    // красный круг по HP
    if (hpBarSet) {
      const impactX =
        (enemy as any).x ?? getFieldRect().fieldX + getFieldRect().fieldW / 2;
      const impactY = hpBarSet ? hpBarY : ((enemy as any).y ?? 0) + 26; // fallback, если не успели задать barY
      hpImpacts.push({
        x: impactX,
        y: impactY,
        r0: 6,
        r1: 36,
        t0: t,
        ms: Math.max(220, st.hitMs + 80),
      });
    }

    requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
    return;
  }

  if (st.phase === "hit") {
    const k = Math.min(1, (t - st.t0) / st.hitMs);
    // лёгкое «пружинящее» покачивание обводки (если она у тебя рисуется относительно врага)
    const outlineKick = Math.sin(k * Math.PI) * 2; // 0..2..0
    (enemy as any).__outlineKick = outlineKick; // необязательно, но можно учесть в рендере обводки

    if (!st.dmgApplied && st.hitMs - (t - st.t0) <= 16) {
      applyEnemyDamageToPlayer(cfg, enemy, ctx);
      st.dmgApplied = true;
    }

    if (k < 1) {
      requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
      return;
    }

    st.phase = "up";
    st.t0 = t;
    requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
    return;
  }

  if (st.phase === "up") {
    const k = Math.min(1, (t - st.t0) / st.upMs);
    // Возврат с лёгким перелётом
    const back = easeOutBack(k);
    const y = lerp(st.targetY, st.startY - 6 /* маленький «перелёт» */, back);
    setEnemyYOffset(enemy, y - st.startY);

    if (k < 1) {
      requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
      return;
    }

    setEnemyYOffset(enemy, 0);
    (enemy as any).__outlineKick = 0;
    animByEnemy.delete(enemy);
    return;
  }
}

/* ───────────────────────────── Урон игроку ──────────────────────────────── */

function applyEnemyDamageToPlayer(
  cfg: Cfg,
  enemy: Enemy,
  ctx: { reason: string; totalDamage?: number }
) {
  if (!cfg?.player) return;

  const rules: any = (cfg as any).rules ?? {};
  const base = Number((enemy as any).atk ?? 6);
  const isBoss = (enemy as any).kind === "boss";
  const mul = isBoss
    ? Number(rules.bossRetaliationMul ?? 0.75)
    : Number(rules.retaliationMul ?? 0.5);
  const reactive = ctx.totalDamage
    ? Math.min(1.5, 0.3 + ctx.totalDamage / 100)
    : 1;

  let dmg = Math.max(1, Math.round(base * mul * reactive));
  const def = Number((cfg.player as any).defense ?? 0);
  dmg = Math.max(0, dmg - def);

  const prev = Number((cfg.player as any).hp ?? 0);
  (cfg.player as any).hp = Math.max(0, prev - dmg);

  try {
    (cfg.player as any).onDamaged?.(dmg, enemy, ctx.reason);
  } catch {}
  console.log(
    `[retaliation→HP] enemy=${(enemy as any).id ?? "?"} dmg=${dmg} reason=${
      ctx.reason
    }`
  );
}

/* ───────────────────────────── Мелочи ──────────────────────────────────── */

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

type Enemy = {
  id: number;
  kind: "minion" | "boss";
  type: number;
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
      type: m.type,
    });
  }

  // добавляем босса
  enemies.push({
    id: 999,
    kind: "boss",
    type: cfg.boss.type,
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
function drawEnemyBadge(s: p5, e: Enemy, offset = 0) {
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
  s.text(String(e.hp), e.x + 1, e.y + hpDy + 1 + offset);
  s.textSize(atkSize);
  s.text(String(e.atk), e.x + 1, e.y + atkDy + 1 + offset);

  // основной слой: чёрный текст с полупрозрачным белым контуром
  s.stroke(255, 255, 255, 150);
  s.strokeWeight(isBoss ? 1.2 : 1.0);
  s.fill(20);
  s.textSize(hpSize);
  s.text(String(e.hp), e.x, e.y + hpDy + offset);
  s.textSize(atkSize);
  s.text(String(e.atk), e.x, e.y + atkDy + offset);
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
    initGameLogger();
    console.info("Game logger initialized");
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
      s.circle(e.x, e.y + getEnemyYOffset(e), e.r * 2);

      // подсветка наведённого круга (серое + белое полупрозрачное кольцо)
      if (hoveredId === e.id) {
        s.noFill();
        s.stroke(100);
        s.strokeWeight(3);
        s.circle(e.x, e.y + getEnemyYOffset(e), e.r * 2 + 6);
        s.noStroke();
      }

      // подписи HP/ATK
      drawEnemyBadge(s, e, getEnemyYOffset(e));
    }

    let barY = fieldH;
    const weaponY = barY;
    drawLogPanel(s, cfg);
    drawPanelBg(s, fieldX, barY, fieldW, 750, cfg.field?.bg);
    drawHpStatus(s, fieldX, barY, fieldW, {
      hp: cfg.player.hp,
      hpMax: cfg.player.hpMax,
    });
    // один раз на старте кадра (или при изменении лэйаута) укажи якорь HP
    // например, центр полоски HP:
    setHpBarY(barY);
    drawHpImpactOverlay(s);

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
    //updateRetaliationAnimations(cfg, s);
  };

  // ответы врага

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

    // Ответ врага
    if (
      result &&
      typeof result === "object" &&
      result.type !== "ab8" &&
      result.type !== "skip"
    ) {
      queueEnemyRetaliationToHp(
        cfg,
        enemy,
        enemies,
        { reason: "counter", totalDamage: 1 },
        "t1"
      );
    }

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
