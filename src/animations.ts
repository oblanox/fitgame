import { Cfg, Enemy, ElementKey } from "./types";
import { addTag, hasTag, removeTag } from "./combat";

/* ---------- анимация / эффекты для main.ts ---------- */

/** Состояние одной анимации прыжка/удара врага */
type EnemyAnimState = {
  phase: "down" | "hit" | "up";
  t0: number;
  downMs: number;
  hitMs: number;
  upMs: number;
  startY: number;
  targetY: number;
  dmgApplied: boolean;
};

/** Массив всплесков (эффект на HP bar) */
type HpImpact = {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t0: number;
  ms: number;
};

const animByEnemy: WeakMap<Enemy, EnemyAnimState> = new WeakMap();
const hpImpacts: HpImpact[] = [];
let hpBarY = 0;
let hpBarSet = false;

// --- вставить в верх файла (уже импортированы Cfg, Enemy, ElementKey) ---
type RegenOrb = {
  id: number;
  startX: number;
  startY: number;
  tx: number;
  ty: number;
  size: number;
  t0: number; // global start timestamp
  delay: number; // ms before movement starts
  dur: number; // ms travel duration
  element: ElementKey | string;
  alpha: number;
  ripple: boolean; // сделать вспышку при попадании
};

const regenOrbs: RegenOrb[] = [];
let nextRegenOrbId = 1;

// ---- Float text: элементный цвет + чёрная окантовка + крит = красная внутренняя окантовка ----
type FloatText = {
  id: number;
  x: number;
  y: number;
  t0: number;
  ms: number;
  amount: number | "miss";
  element?: ElementKey; // "earth" | "fire" | ...
  colorHex?: string; // fallback if element not provided
  crit?: boolean;
  size0: number;
  rise: number;
};

let nextFloatTextId = 1;
const floatTexts: FloatText[] = [];

function hexToRgb(hex: string) {
  const h = (hex || "#FFFFFF").replace("#", "");
  const hx =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const v = parseInt(hx, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/**
 * spawnFloatText(x, y, amount, opts)
 * amount: number (например -34) или строка "miss" (покажем ПРОМАХ)
 * opts:
 *   element?: ElementKey  -- предпочтительный источник цвета
 *   colorHex?: string     -- fallback цвет в hex
 *   crit?: boolean
 *   ms?: number
 *   size?: number
 *   rise?: number
 */
export function spawnFloatText(
  x: number,
  y: number,
  amount: number | "miss",
  opts: {
    element?: ElementKey;
    colorHex?: string;
    crit?: boolean;
    ms?: number;
    size?: number;
    rise?: number;
  } = {}
) {
  const ms = opts.ms ?? (opts.crit ? 1100 : 900);
  const size0 = opts.size ?? (opts.crit ? 42 : 66);
  const rise = opts.rise ?? (opts.crit ? 56 : 46);
  const el = opts.element;
  floatTexts.push({
    id: nextFloatTextId++,
    x,
    y,
    t0: nowMs(),
    ms,
    amount,
    element: el,
    colorHex: opts.colorHex,
    crit: !!opts.crit,
    size0,
    rise,
  });
}

/** Вызывать в draw loop: drawFloatTexts(p) */
export function drawFloatTexts(p: any /* p5 */) {
  if (!floatTexts.length) return;
  const t = nowMs();

  for (let i = floatTexts.length - 1; i >= 0; --i) {
    const f = floatTexts[i];
    const dt = t - f.t0;
    const k = Math.max(0, Math.min(1, dt / Math.max(1, f.ms)));
    const ek = easeOutCubic(k);
    const alpha = Math.round(255 * Math.max(0, 1 - k)); // 255..0

    // position + slight bob
    const x = f.x + Math.sin((t + f.id * 37) / 260) * 4 * (1 - ek);
    const y =
      f.y - f.rise * ek - Math.sin((t + f.id * 97) / 180) * 6 * (1 - ek);

    // size
    const size = f.size0 * (1 + (1 - ek) * 0.08);

    // text
    const text =
      f.amount === "miss" ? "ПРОМАХ" : String(Math.round(f.amount as number)); // округляем

    // color from element or fallback
    const elemRgb = elementColorRGB(f.element ?? (f as any).colorHex);
    // if explicit colorHex passed, override:
    const colorHex = (f as any).colorHex;
    const mainRgb = colorHex ? hexToRgb(colorHex) : elemRgb;

    p.push();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(size);

    if (!f.crit) {
      // 1) Outer black outline (thick) - всегда присутствует
      p.stroke(0, Math.floor(230 * (alpha / 255)));
      p.strokeWeight(Math.max(2, Math.round(size * 0.08)));
      p.fill(mainRgb.r, mainRgb.g, mainRgb.b, Math.floor(230 * (alpha / 255)));
      p.text(text, x, y);
    } else {
      // 2) If crit: inner red outline (thinner) to make critical pop
      p.stroke(229, 57, 53, Math.floor(220 * (alpha / 255))); // red
      p.strokeWeight(Math.max(1, Math.round(size * 0.21)));
      p.textSize(size * 1.5);
      // draw again (keeps same fill)
      p.text(text, x, y);
      // optionally add a tiny white-ish top highlight:
      p.noStroke();
      p.fill(255, Math.floor(60 * (alpha / 255)));
      p.text(text, x, y - Math.max(1, size * 0.03));
    }

    p.pop();

    if (k >= 1) floatTexts.splice(i, 1);
  }
}

// Мини-версия регена для миньона — обёртка над triggerBossRegenSuck
export function triggerMinionRegenSuck(
  cfg: Cfg,
  minion: Enemy,
  opts: {
    count?: number;
    spreadRadius?: number;
    duration?: number;
    maxSize?: number;
    minSize?: number;
    onComplete?: () => void;
  } = {}
) {
  // значения по-умолчанию — меньше, чем у босса
  const defaults = {
    count: 6, // меньше кружков
    spreadRadius: 60, // плотнее вокруг миньона
    duration: 520, // быстрее летят
    maxSize: 6,
    minSize: 2,
  };

  const merged = {
    count: opts.count ?? defaults.count,
    spreadRadius: opts.spreadRadius ?? defaults.spreadRadius,
    duration: opts.duration ?? defaults.duration,
    maxSize: opts.maxSize ?? defaults.maxSize,
    minSize: opts.minSize ?? defaults.minSize,
    onComplete: opts.onComplete,
  };

  // просто вызываем общий триггер с меньшими параметрами
  return triggerBossRegenSuck(cfg, minion, merged);
}

// helper palette (копия/вариант из attack.ts / ab0.ts)
function elementColorRGB(el: string) {
  const map: Record<string, string> = {
    earth: "#129447",
    fire: "#E53935",
    water: "#1E88E5",
    cosmos: "#8E24AA",
    none: "#CCCCCC",
  };
  const hex = map[el] ?? "#FFFFFF";
  const h = hex.replace("#", "");
  const hx =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const v = parseInt(hx, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

// easing (small util)
function easeOutCubic(t: number) {
  t = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - t, 3);
}

// public: вызвать, когда начинается реген босса (конец хода)
// opts:
//  - count: число орбов (целое)
//  - spreadRadius: радиус начального разброса вокруг босса (px)
//  - duration: время каждого шарика в мс (движение)
//  - maxSize/minSize: размеры пикселей
//  - onComplete: callback когда ВСЕ орбы дошли
export function triggerBossRegenSuck(
  cfg: Cfg,
  boss: Enemy,
  opts: {
    count?: number;
    spreadRadius?: number;
    duration?: number;
    maxSize?: number;
    minSize?: number;
    onComplete?: () => void;
  } = {}
) {
  if (!boss || !cfg) {
    if (opts.onComplete) opts.onComplete();
    return;
  }

  const count = Math.max(6, Math.floor(opts.count ?? 16));
  const spreadRadius = opts.spreadRadius ?? 200;
  const duration = opts.duration ?? 900;
  const maxSize = opts.maxSize ?? 12;
  const minSize = opts.minSize ?? 4;
  const el = (boss as any).element ?? "none";

  const now = nowMs();
  const created: number[] = [];

  for (let i = 0; i < count; i++) {
    // angle + radial jitter (start point around boss)
    const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
    const r = spreadRadius * (0.3 + Math.random() * 0.9);
    const sx = (boss.x ?? 0) + Math.cos(ang) * r + (Math.random() - 0.5) * 24;
    const sy = (boss.y ?? 0) + Math.sin(ang) * r + (Math.random() - 0.5) * 18;

    const orb: RegenOrb = {
      id: nextRegenOrbId++,
      startX: sx,
      startY: sy,
      tx: boss.x ?? 0,
      ty: (boss.y ?? 0) + (boss.lineOffset ?? 0),
      size: Math.round(minSize + Math.random() * (maxSize - minSize)),
      t0: now,
      delay: Math.round(Math.random() * 220), // staggered start
      dur: duration + Math.round(Math.random() * 240) - 120,
      element: el,
      alpha: 0.0,
      ripple: Math.random() < 0.22, // часть даст вспышку при попадании
    };
    regenOrbs.push(orb);
    created.push(orb.id);
  }

  // when all finished -> call onComplete (poll by timeout)
  const timeout =
    Math.max(
      ...regenOrbs
        .filter((o) => created.includes(o.id))
        .map((o) => o.delay + o.dur)
    ) + 120;
  setTimeout(() => {
    if (opts.onComplete) opts.onComplete();
  }, timeout);

  return created;
}

export function drawBossRegenOrbs(p: any /* p5 */) {
  if (!regenOrbs.length) return;
  const t = nowMs();

  for (let i = regenOrbs.length - 1; i >= 0; --i) {
    const o = regenOrbs[i];
    const localT = t - o.t0 - o.delay;
    if (localT < 0) {
      // появление — маленький фэйд in
      const inK = Math.max(0, 1 + localT / 180);
      const col = elementColorRGB(String(o.element));
      p.push();
      p.noStroke();
      p.fill(col.r, col.g, col.b, Math.floor(200 * inK * 0.6));
      p.circle(o.startX, o.startY, o.size * 0.5);
      p.pop();
      continue;
    }

    const k = Math.min(1, localT / Math.max(1, o.dur));
    const ek = easeOutCubic(k);

    // нелинейная траектория (кривая Безье)
    const cx =
      o.startX +
      (o.tx - o.startX) * 0.5 +
      Math.sin((o.id + t / 500) * 0.7) * 18;
    const cy = o.startY + (o.ty - o.startY) * 0.5 - 36 * (1 - ek);
    const ix =
      (1 - ek) * (1 - ek) * o.startX + 2 * (1 - ek) * ek * cx + ek * ek * o.tx;
    const iy =
      (1 - ek) * (1 - ek) * o.startY + 2 * (1 - ek) * ek * cy + ek * ek * o.ty;

    const col = elementColorRGB(String(o.element));
    // основной альфа (для свечения)
    const glowAlpha = Math.max(0.06, (1 - k) * 0.9 + 0.1);

    // Параметры окантовки (можно подправить при вызове triggerBossRegenSuck)
    const outlineBaseAlpha = 0.6; // максимальная непрозрачность обводки (0..1)
    const outlineWidthFactor = 0.18; // доля от размера → толщина stroke

    // уменьшение окантовки по мере подхода (чтобы не давило на центр)
    const outlineFade = Math.pow(1 - ek, 0.9); // 1 -> на старте, 0 -> в конце
    const outlineAlpha = Math.floor(255 * outlineBaseAlpha * outlineFade);

    // TRAIL / GLOW (слой под окантовкой)
    p.push();
    p.noStroke();
    p.fill(col.r, col.g, col.b, Math.floor(120 * glowAlpha));
    p.circle(ix, iy, Math.max(2, o.size * (1 + (1 - ek) * 1.2)));
    p.fill(col.r, col.g, col.b, Math.floor(220 * glowAlpha));
    p.circle(ix, iy, Math.max(1, o.size * (0.8 + ek * 0.6)));
    p.pop();

    // faint pull-line
    p.push();
    p.stroke(col.r, col.g, col.b, Math.floor(80 * (1 - ek)));
    p.strokeWeight(1);
    p.line(ix, iy, o.tx, o.ty);
    p.pop();

    // ---- ЧЁРНАЯ ПОЛУПРОЗРАЧНАЯ ОКАНТОВКА ----
    // нарисуем тонкую внешнюю обводку: сначала слегка прозрачный внешний круг (чтобы окантовка выглядела мягкой),
    // затем более плотную центральную обводку.
    const outlineW = Math.max(
      1,
      o.size * outlineWidthFactor * (0.6 + outlineFade * 0.8)
    ); // толщина в px

    p.push();
    // внешний мягкий контур (больший радиус, более прозрачный)
    p.stroke(0, Math.floor(outlineAlpha * 0.55)); // 55% от основной
    p.strokeWeight(Math.max(1, outlineW * 1.6));
    p.noFill();
    p.circle(ix, iy, Math.max(2, o.size * (1.2 + (1 - ek) * 0.6)));

    // более явная тонкая обводка по краю (чётче)
    p.stroke(0, outlineAlpha);
    p.strokeWeight(Math.max(1, outlineW));
    p.noFill();
    p.circle(ix, iy, Math.max(2, o.size * (0.9 + ek * 0.6)));
    p.pop();
    // ----------------------------------------

    // при достижении цели — вспышка / ripple
    if (k >= 1) {
      if (o.ripple) {
        hpImpacts.push({
          x: o.tx,
          y: o.ty,
          r0: 6,
          r1: 30 + Math.random() * 24,
          t0: t,
          ms: 260 + Math.random() * 240,
        });
      }
      regenOrbs.splice(i, 1);
    }
  }
}

export function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}
export function easeInOutQuad(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
export function easeOutBack(t: number) {
  t = Math.max(0, Math.min(1, t));
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Сеттер якоря HP-бар (вызывается из main.draw после определения позиции) */
export function setHpBarY(y: number) {
  hpBarY = y;
  hpBarSet = true;
}

/** Отрисовка всплесков по HP (нужно вызывать в draw loop) */
export function drawHpImpactOverlay(p: any /* p5 */) {
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

/** Возвращает текущий Y-смещение для врага (анимация его движения) */
export function getEnemyYOffset(e: Enemy): number {
  return Number(e.yOffset ?? 0) || 0;
}
function setEnemyYOffset(e: Enemy, yOff: number) {
  e.yOffset = yOff || 0;
}

/** Очередь анимированных ответок от врагов (rule: t1/t2/t3) */
// В animations.ts — замените/обновите определение функции на это.
export function queueEnemyRetaliationToHp(
  cfg: Cfg,
  target: Enemy,
  all: Enemy[],
  ctx: {
    reason: string;
    totalDamage?: number;
    hits?: { id: number; damage: number; didMiss?: boolean }[];
  },
  rule: "t1" | "t2" | "t3" = "t1",
  abilityType: string,
  retaliatorIds?: number[] | null, // <- НОВЫЙ параметр
  onComplete?: () => void
) {
  // быстрое guard
  if (!cfg?.player || !target || target.hp <= 0) {
    if (typeof onComplete === "function") onComplete();
    return;
  }

  // блок взаимодействия игрока
  (window as any).__isPlayerInteractionBlocked = true;

  // Если нам передали явный список retaliatorIds — используем его как источник правды
  let finalList: Enemy[] = [];
  if (Array.isArray(retaliatorIds) && retaliatorIds.length > 0) {
    const idSet = new Set(retaliatorIds);
    finalList = all.filter((e) => idSet.has(e.id) && e.hp > 0);
    // debug
    if ((window as any).__DEBUG_RETAL) {
      console.debug(
        "[RETAL] using explicit retaliatorIds ->",
        Array.from(idSet),
        "final:",
        finalList.map((x) => x.id)
      );
    }
  } else {
    // fallback: прежняя логика (с учётом ctx.hits / rule / abilityType)
    // --- build hitsMap ---
    const hitsMap = new Map<number, { damage: number; didMiss?: boolean }>();
    if (Array.isArray(ctx.hits)) {
      for (const h of ctx.hits)
        hitsMap.set(h.id, { damage: h.damage ?? 0, didMiss: !!h.didMiss });
    }

    const row = Number(target.row ?? 1);
    const directHit = abilityType === "ab0" || abilityType === "point";

    // initial candidates by rule (preserve legacy behavior)
    let candidates: Enemy[] = [];
    switch (rule) {
      case "t1":
        if (abilityType === "point" || abilityType === "ab0")
          candidates = all.filter(
            (e) => e.kind === "minion" && Number(e.type) === 1 && e.hp > 0
          );
        else candidates = [target];
        break;
      case "t2": {
        candidates = [target];
        const sameRow = all
          .filter(
            (e) => e !== target && e.hp > 0 && Number(e.row ?? row) === row
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - target.x, a.y - target.y) -
              Math.hypot(b.x - target.x, b.y - target.y)
          );
        if (sameRow[0]) candidates.push(sameRow[0]);
        break;
      }
      case "t3":
        candidates = all.filter(
          (e) => e.hp > 0 && Number(e.row ?? row) === row
        );
        break;
      default:
        candidates = [target];
    }

    const isDirectBossHit = target.kind === "boss" && abilityType === "point";

    if (isDirectBossHit) {
      const allMinions = all.filter((e) => e.kind === "minion" && e.hp > 0);
      const allRespond = [...allMinions];
      if (target.hp > 0) allRespond.push(target);
      candidates = allRespond;
    }

    // ensure primary target present
    if (target.hp > 0 && !candidates.find((c) => c.id === target.id))
      candidates.push(target);

    // final filtering according to types (conservative)
    const filtered: Enemy[] = [];
    const seen = new Set<number>();
    for (const e of candidates) {
      if (!e || e.hp <= 0) continue;
      const eid = e.id;
      if (seen.has(eid)) continue;
      seen.add(eid);

      if (e.kind === "minion") {
        const mtype = Number(e.type ?? 1);
        if (mtype === 1) {
          // aggressive: if either hit or included by candidates -> respond
          const wasHit = hitsMap.has(eid);
          if (wasHit || candidates.includes(e)) filtered.push(e);
        } else if (mtype === 2) {
          // passive: only primary and actually hit
          const entry = hitsMap.get(eid);
          const wasPrimaryHit =
            eid === target.id &&
            !!entry &&
            entry.didMiss === false &&
            (entry.damage ?? 0) > 0;
          if (wasPrimaryHit) filtered.push(e);
        } else {
          // other: require primary and hit
          const entry = hitsMap.get(eid);
          const wasPrimaryHit =
            eid === target.id &&
            !!entry &&
            entry.didMiss === false &&
            (entry.damage ?? 0) > 0;
          if (wasPrimaryHit) filtered.push(e);
        }
      } else if (e.kind === "boss") {
        if (e.id === target.id) {
          const entry = hitsMap.get(e.id);
          if (
            directHit ||
            (!!entry && entry.didMiss === false && (entry.damage ?? 0) > 0)
          )
            filtered.push(e);
        }
      } else {
        const entry = hitsMap.get(e.id);
        const wasPrimaryHit =
          e.id === target.id &&
          !!entry &&
          entry.didMiss === false &&
          (entry.damage ?? 0) > 0;
        if (wasPrimaryHit) filtered.push(e);
      }
    }

    // also ensure aggressive minions that were hit but not in candidates are included
    if (Array.isArray(ctx.hits) && ctx.hits.length > 0) {
      for (const h of ctx.hits) {
        const eobj = all.find((x) => x.id === h.id);
        if (!eobj || eobj.hp <= 0) continue;
        const mtype = Number((eobj as any).type ?? 1);
        if (mtype === 1 && !filtered.find((f) => f.id === eobj.id))
          filtered.push(eobj);
      }
    }

    // dedupe final
    const dedup = new Map<number, Enemy>();
    for (const e of filtered) dedup.set(e.id, e);
    finalList = Array.from(dedup.values());

    if ((window as any).__DEBUG_RETAL) {
      console.debug(
        "[RETAL] fallback finalList:",
        finalList.map((x) => x.id),
        "candidates:",
        candidates.map((x) => x.id)
      );
    }
  }

  // schedule animations on finalList (unchanged behavior)
  const gap = cfg?.rules?.chainGapMs ?? 120;
  const totalEnemies = finalList.length;
  let completedEnemies = 0;

  for (const ev of all) {
    if (!ev || ev.hp <= 0) continue;
    if (ev.kind === "minion" && Number(ev.type) === 1) {
      // add if not present already
      if (!finalList.find((f) => f.id === ev.id)) finalList.push(ev);
    }
  }

  finalList.forEach((e, i) => {
    setTimeout(() => {
      // startEnemyDiveToHp — оставляем как есть
      startEnemyDiveToHp(cfg, e, ctx, () => {
        completedEnemies++;
        if (
          completedEnemies >= totalEnemies &&
          typeof onComplete === "function"
        ) {
          (window as any).__isPlayerInteractionBlocked = false;
          onComplete();
        }
      });
    }, i * gap);
  });

  if (finalList.length === 0) {
    (window as any).__isPlayerInteractionBlocked = false;
    if (typeof onComplete === "function") onComplete();
  }
}

/** Начать анимацию удара данного врага в HP-бар игрока */
function startEnemyDiveToHp(
  cfg: Cfg,
  enemy: Enemy,
  ctx: { reason: string; totalDamage?: number },
  onComplete?: () => void // ← Добавляем callback
) {
  if (enemy.hp <= 0 || animByEnemy.get(enemy)) {
    if (onComplete) onComplete();
    return;
  }
  const hasHp = hpBarSet;
  const rules: any = (cfg as any).rules ?? {};
  const downMs = hasHp ? Number(rules.outMs ?? 240) : 140;
  const hitMs = Number(rules.hitMs ?? 120);
  const upMs = hasHp ? Number(rules.backMs ?? 260) : 160;

  const startY = Number(enemy.y ?? 0);
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
  requestAnimationFrame(() => animTickDive(cfg, enemy, ctx, onComplete)); // ← Передаем callback
}

/** Внутренний тик анимации (рекурсивный через requestAnimationFrame) */
function animTickDive(
  cfg: Cfg,
  enemy: Enemy,
  ctx: { reason: string; totalDamage?: number },
  onComplete?: () => void // ← Добавляем callback
) {
  const st = animByEnemy.get(enemy);
  if (!st) {
    if (onComplete) {
      onComplete();
    }
    return;
  }

  const t = nowMs();

  if (st.phase === "down") {
    if (!hasTag(enemy, "attack"))
      addTag(enemy, "attack", { by: "player", ts: Date.now() });
    const k = Math.min(1, (t - st.t0) / st.downMs);
    const y = lerp(st.startY, st.targetY, easeInOutQuad(k));
    setEnemyYOffset(enemy, y - st.startY);
    if (k < 1) {
      requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
      return;
    }

    st.phase = "hit";
    st.t0 = t;

    if (hpBarSet) {
      const impactX = enemy.x ?? 0;
      const impactY = hpBarSet ? hpBarY : enemy.y + 26;
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
    const outlineKick = Math.sin(k * Math.PI) * 2;
    (enemy as any).__outlineKick = outlineKick;

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
    const back = easeOutBack(k);
    const y = lerp(st.targetY, st.startY - 6, back);
    setEnemyYOffset(enemy, y - st.startY);

    if (k < 1) {
      requestAnimationFrame(() => animTickDive(cfg, enemy, ctx, onComplete));
      removeTag(enemy, "attack");
      return;
    }

    setEnemyYOffset(enemy, 0);
    (enemy as any).__outlineKick = 0;
    animByEnemy.delete(enemy);
    removeTag(enemy, "attack");
    try {
      // removeTag должен быть доступен в скоупе (импортируй его, если в другом модуле)
    } catch (err) {
      console.error("[animTickDive] removeTag error:", err);
    }
    // Вызываем callback при завершении анимации
    if (onComplete) {
      onComplete();
    }
    return;
  }
}

/** Когда во время хита надо уменьшить HP игрока — анимация вызывает это */
// Вверху файла убедитесь, что импортирован ElementKey:
// import { Cfg, Enemy, ElementKey } from "./types";

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

  // reactive: базовый минимум 1.0, растёт при большом totalDamage
  const rawReactive =
    ctx && typeof ctx.totalDamage === "number"
      ? 0.3 + Number(ctx.totalDamage) / 100
      : 1;
  const reactive = Math.min(1.5, Math.max(1, rawReactive));

  // сырой урон до учета стихии и защиты
  let raw = base * mul * reactive;

  // --- УЧЁТ СТИХИИ (без ошибки типов) ---
  // гарантируем корректный ключ элемента
  const elKey = ((enemy as any).element ?? "none") as ElementKey;

  // player.elements может быть undefined или Partial<Record<ElementKey, number>>
  const playerElMap: Partial<Record<ElementKey, number>> =
    (cfg.player as any).elements ?? {};

  // безопасно читаем процент сопротивления (если задано)
  const elPct = Number(playerElMap[elKey] ?? 0); // 0..1 (или 0..100?) — зависит от конфигурации

  // если в конфиге элементы заданы в процентах >1 (например 84 вместо 0.84),
  // можно автоматически нормировать — но оставим как есть (должны передавать 0..1).
  if (elPct > 1) {
    // Защитный шаг: если вдруг в конфиге записаны проценты 84 (вместо 0.84),
    // интерпретируем >1 как процент и конвертируем.
    raw = raw * Math.max(0, 1 - elPct / 100);
  } else {
    raw = raw * Math.max(0, 1 - elPct);
  }

  // Округление и вычисление после защиты
  let dmg = Math.round(raw);
  const def = Number((cfg.player as any).defense ?? 0);
  dmg = Math.max(0, dmg - def);

  // Минимальный урон после защиты (опция)
  const minAfterDef = Number(rules.minRetaliationDmg ?? 0);
  if (minAfterDef > 0 && raw > 0 && dmg <= 0) dmg = minAfterDef;

  // Применяем к HP игрока
  const prev = Number((cfg.player as any).hp ?? 0);
  (cfg.player as any).hp = Math.max(0, prev - dmg);

  // Callback для UI (если установлен)
  try {
    (cfg.player as any).onDamaged?.(dmg, enemy, ctx.reason);
  } catch (e) {}

  console.log(
    `[retaliation→HP] enemy=${(enemy as any).id ?? "?"} raw=${raw.toFixed(
      2
    )} def=${def} dmg=${dmg} reason=${ctx.reason}`
  );
}

/* ------------------ Death animation & utilities ------------------ */

/**
 * Начать анимацию смерти врага (уменьшение/фейд) и вызвать onComplete когда завершится.
 * - cfg: конфиг (для правил/таймингов)
 * - enemy: цель
 * - onComplete: callback, вызывается после того как enemy визуально исчез (в main удалим объект и пересчитаем layout)
 */
// Замена функции startEnemyDeath в animations.ts
export function startEnemyDeath(
  cfg: Cfg,
  enemy: Enemy,
  onComplete?: (enemy: Enemy) => void,
  // внутренние опции для retry — не обязательно передавать извне
  _opts?: { retryDelayMs?: number; maxRetries?: number; _attempt?: number }
) {
  removeTag(enemy, "attack");
  const retryDelayMs = _opts?.retryDelayMs ?? 40;
  const maxRetries = _opts?.maxRetries ?? 50;
  const attempt = (_opts?._attempt ?? 0) + 1;

  console.log("[LOG] startEnemyDeath for", enemy?.id, "attempt", attempt);

  if (!enemy) {
    console.log("[LOG] startEnemyDeath invalid enemy", enemy);
    if (onComplete) onComplete(enemy);
    return;
  }

  // Если уже есть анимация (animByEnemy) — попробуем подождать и повторить
  if (animByEnemy.get(enemy)) {
    console.log(
      "[LOG] startEnemyDeath: enemy",
      enemy.id,
      "is currently animating, will retry",
      attempt,
      "of",
      maxRetries
    );
    if (attempt >= maxRetries) {
      removeTag(enemy, "attack");
      console.warn(
        "[WARN] startEnemyDeath: max retries reached for",
        enemy.id,
        "- calling onComplete to avoid hang"
      );
      if (onComplete) onComplete(enemy);
      return;
    }
    // отложенный повтор (с увеличивающимся количеством попыток)
    setTimeout(
      () =>
        startEnemyDeath(cfg, enemy, onComplete, {
          retryDelayMs,
          maxRetries,
          _attempt: attempt,
        }),
      retryDelayMs
    );
    return;
  }

  // Теперь — нормальный запуск death-анимации (как было)
  const rules: any = (cfg as any).rules ?? {};
  const deathMs = Number(rules.deathMs ?? 420);

  // Mark as dying
  (enemy as any).__dead = true;
  (enemy as any).__deadStart = nowMs();
  (enemy as any).__deadMs = deathMs;

  // используем animByEnemy как флаг/контейнер, чтобы не мешать dive-анимациям
  const st: EnemyAnimState = {
    phase: "down",
    t0: nowMs(),
    downMs: deathMs,
    hitMs: 0,
    upMs: 0,
    startY: Number(enemy.y ?? 0),
    targetY: Number(enemy.y ?? 0),
    dmgApplied: true,
  };
  animByEnemy.set(enemy, st);

  const start = nowMs();
  const tick = () => {
    const t = nowMs();
    const k = Math.min(1, (t - start) / deathMs);

    //console.log("[LOG] Death animation progress for", enemy.id, ":", k);

    (enemy as any).__deadScale = 1 - easeInOutQuad(k);
    (enemy as any).__deadAlpha = 1 - k;

    if (k >= 0.15 && !(enemy as any).__deathImpactPushed) {
      (enemy as any).__deathImpactPushed = true;
      hpImpacts.push({
        x: enemy.x ?? 0,
        y: hpBarSet ? hpBarY : (enemy.y ?? 0) + 20,
        r0: 8,
        r1: 56,
        t0: t,
        ms: Math.max(220, 360),
      });
    }

    if (k < 1) {
      requestAnimationFrame(tick);
    } else {
      console.log("[LOG] startEnemyDeath DONE for", enemy.id);
      animByEnemy.delete(enemy);
      (enemy as any).__deadScale = 0;
      (enemy as any).__deadAlpha = 0;
      if (onComplete) {
        console.log("[LOG] Calling onComplete for", enemy.id);
        onComplete(enemy);
      } else {
        console.log("[LOG] No onComplete provided for", enemy.id);
      }
    }
  };

  requestAnimationFrame(tick);
}
