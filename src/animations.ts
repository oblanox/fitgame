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

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}
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
  ctx: { reason: string; totalDamage?: number },
  rule: "t1" | "t2" | "t3" = "t1"
) {
  if (!cfg?.player || !target || target.hp <= 0) return;

  const row = Number(target.row ?? 1);
  let list: Enemy[] = [];
  switch (rule) {
    case "t1":
      list = [target];
      break;
    case "t2": {
      list = [target];
      const sameRow = all
        .filter((e) => e !== target && e.hp > 0 && Number(e.row ?? row) === row)
        .sort(
          (a, b) =>
            Math.abs((a as any).col - (target as any).col) -
            Math.abs((b as any).col - (target as any).col)
        );
      if (sameRow[0]) list.push(sameRow[0]);
      break;
    }
    case "t3":
      list = all.filter((e) => e.hp > 0 && Number(e.row ?? row) === row);
      break;
  }

  list = list.filter((e) => !animByEnemy.get(e));
  const rules: any = (cfg as any).rules ?? {};
  const gap = Number(rules.chainGapMs ?? 120);

  list.forEach((e, i) => {
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
