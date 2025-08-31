import { Cfg, Enemy } from "./types";

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
function easeOutBack(t: number) {
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
export function queueEnemyRetaliationToHp(
  cfg: Cfg,
  target: Enemy,
  all: Enemy[],
  ctx: {
    reason: string;
    totalDamage?: number;
    hits?: { id: number; damage: number; didMiss?: boolean }[];
  },
  rule: "t1" | "t2" | "t3" = "t1"
) {
  if (!cfg?.player || !target || target.hp <= 0) return;

  const row = Number(target.row ?? 1);

  // candidates as before (rule t1/t2/t3 and boss special-case)
  let candidates: Enemy[] = [];
  // --- build candidates by rule ---
  switch (rule) {
    case "t1":
      candidates = [target];
      break;
    case "t2": {
      // target + nearest alive in same row (if any)
      candidates = [target];
      const sameRow = all
        .filter((e) => e !== target && e.hp > 0 && Number(e.row ?? row) === row)
        .sort(
          (a, b) =>
            Math.hypot(a.x - target.x, a.y - target.y) -
            Math.hypot(b.x - target.x, b.y - target.y)
        );
      if (sameRow[0]) candidates.push(sameRow[0]);
      break;
    }
    case "t3":
      // all alive in same row
      candidates = all.filter((e) => e.hp > 0 && Number(e.row ?? row) === row);
      break;
    default:
      candidates = [target];
  }

  // boss special-case: if you attacked the boss, the spec says many/all minions may respond
  if (target.kind === "boss") {
    // decide: make all minions (alive) candidates
    const allMinions = all.filter((e) => e.kind === "minion" && e.hp > 0);
    if (allMinions.length > 0) candidates = allMinions;
  }

  // Build hits map for quick lookup
  // --- include actual-hit targets into candidates (so hits outside rule still can retaliate) ---
  if (Array.isArray(ctx.hits) && ctx.hits.length > 0) {
    for (const h of ctx.hits) {
      const eid = h.id;
      const eobj = all.find((x) => x.id === eid);
      if (eobj && eobj.hp > 0 && !candidates.includes(eobj)) {
        candidates.push(eobj);
      }
    }
  }

  // build hitsMap for filtering
  const hitsMap = new Map<number, { damage: number; didMiss?: boolean }>();
  if (Array.isArray(ctx.hits)) {
    for (const h of ctx.hits)
      hitsMap.set(h.id, { damage: h.damage ?? 0, didMiss: !!h.didMiss });
  }

  // Пример строгой фильтрации пассивных: требуем факт попадания (didMiss=false) и damage>0
  const filtered: Enemy[] = [];
  const seen = new Set<number | string>();
  for (const e of candidates) {
    if (!e || e.hp <= 0) continue;
    if (animByEnemy.get(e)) continue;

    const eid = e.id ?? `${e.kind}_${e.row}_${e.col}`;
    if (seen.has(eid)) continue;
    seen.add(eid);

    if (e.kind === "minion") {
      const mtype = Number(e.type ?? 1);
      if (mtype === 1) {
        // aggressive -> always respond (if in candidates)
        filtered.push(e);
      } else if (mtype === 2) {
        // passive -> only if actually hit (strict)
        const entry = hitsMap.get(e.id);
        const didActuallyHit =
          !!entry && entry.didMiss === false && (entry.damage ?? 0) > 0;
        if (didActuallyHit) filtered.push(e);
      } else {
        filtered.push(e);
      }
    } else {
      filtered.push(e);
    }
  }

  // schedule animations as before
  const gap = cfg?.rules?.chainGapMs ?? 120;
  filtered.forEach((e, i) => {
    setTimeout(() => startEnemyDiveToHp(cfg, e, ctx), i * gap);
  });
}

/** Начать анимацию удара данного врага в HP-бар игрока */
function startEnemyDiveToHp(
  cfg: Cfg,
  enemy: Enemy,
  ctx: { reason: string; totalDamage?: number }
) {
  if (enemy.hp <= 0 || animByEnemy.get(enemy)) return;

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
  requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
}

/** Внутренний тик анимации (рекурсивный через requestAnimationFrame) */
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
      requestAnimationFrame(() => animTickDive(cfg, enemy, ctx));
      return;
    }

    setEnemyYOffset(enemy, 0);
    (enemy as any).__outlineKick = 0;
    animByEnemy.delete(enemy);
    return;
  }
}

/** Когда во время хита надо уменьшить HP игрока — анимация вызывает это */
function applyEnemyDamageToPlayer(
  cfg: Cfg,
  enemy: Enemy,
  ctx: { reason: string; totalDamage?: number }
) {
  if (!cfg?.player) return;

  const rules: any = (cfg as any).rules ?? {};
  const base = Number(enemy.atk ?? 6);
  const isBoss = enemy.kind === "boss";
  const mul = isBoss
    ? Number(rules.bossRetaliationMul ?? 0.75)
    : Number(rules.retaliationMul ?? 0.5);
  const reactive = ctx.totalDamage
    ? Math.min(1.5, 0.3 + ctx.totalDamage / 100)
    : 1;

  let dmg = Math.max(1, Math.round(base * mul * reactive));
  const def = Number((cfg.player as any).defense ?? cfg.player.def ?? 0);
  dmg = Math.max(0, dmg - def);

  const prev = Number(cfg.player.hp ?? 0);
  cfg.player.hp = Math.max(0, prev - dmg);

  try {
    cfg.player.onDamaged?.(dmg, enemy, ctx.reason);
  } catch {}
  console.log(
    `[retaliation→HP] enemy=${enemy.id ?? "?"} dmg=${dmg} reason=${ctx.reason}`
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
