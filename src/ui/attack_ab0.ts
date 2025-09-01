// src/ui/attack_ab0.ts  (замена drawAttackAnimations на drawAttackPre + drawAttackRun)
// (оставил остальную логику как в твоем файле, только разнес фазы по двум функциям)

import type p5 from "p5";
import { Enemy, Cfg } from "../types";

/* store for large images (we load same filenames as glyphs, drawing at native-ish sizes) */
const attackIcons: Record<number, p5.Image | undefined> = {};

export function preloadAttackIcons(p: p5) {
  attackIcons[1] = p.loadImage("assets/icon_weapon_selected_1.png");
  attackIcons[2] = p.loadImage("assets/icon_weapon_selected_2.png");
  attackIcons[3] = p.loadImage("assets/icon_weapon_selected_3.png");
}

type EnemyImpact = {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t0: number;
  ms: number;
  element?: string;
};

const enemyImpacts: EnemyImpact[] = [];

export function spawnEnemyImpact(
  x: number,
  y: number,
  element?: string,
  ms = 360
) {
  if (!x && x !== 0) return;
  const it: EnemyImpact = {
    x,
    y,
    r0: 6,
    r1: 44,
    t0: nowMs(),
    ms,
    element: element ?? "none",
  };
  enemyImpacts.push(it);
}

export function drawEnemyImpacts(p: p5) {
  const t = nowMs();
  for (let i = enemyImpacts.length - 1; i >= 0; --i) {
    const it = enemyImpacts[i];
    const k = Math.min(1, (t - it.t0) / Math.max(1, it.ms));
    const r = it.r0 + (it.r1 - it.r0) * easeOutCubic(k);
    const a = 1 - k;

    // color by element
    const col = elementColor(it.element ?? "none");
    p.push();
    p.noFill();
    p.stroke(col.r, col.g, col.b, Math.floor(220 * a));
    p.strokeWeight(3 * (1 - k * 0.6));
    p.circle(it.x, it.y, r * 2);
    p.noStroke();
    p.fill(col.r, col.g, col.b, Math.floor(140 * a));
    p.circle(it.x, it.y, r * 1.1);
    p.pop();

    if (k >= 1) enemyImpacts.splice(i, 1);
  }
}

/* active animations */
type AttackPhase = "pre" | "run";
type AttackType = "sword" | "spear" | "shuriken";
type ActiveAttack = {
  id: number;
  weaponId: number;
  img?: p5.Image;
  type: AttackType;
  phase: AttackPhase;
  t0: number; // phase start time
  ms: number; // run phase duration
  preMs: number; // pre phase duration (splash)
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  element?: string; // target element for splash color
};
let nextAttackId = 1;
const active: ActiveAttack[] = [];

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function startAttackAnimation(
  cfg: Cfg | null,
  enemy: Enemy,
  weaponId: number,
  opts: { fromX?: number; fromY?: number; ms?: number; preMs?: number } = {}
) {
  if (!enemy) return;
  const img = attackIcons[weaponId];
  const toX = enemy.x ?? 0;
  const toY = (enemy.y ?? 0) + (enemy.lineOffset ?? 0) + (enemy.yOffset ?? 0);

  let type: AttackType = "sword";
  let ms = opts.ms ?? 480;
  let preMs = opts.preMs ?? 160;

  if (weaponId === 2) {
    type = "spear";
    ms = opts.ms ?? 380;
  } else if (weaponId === 3) {
    type = "shuriken";
    ms = opts.ms ?? 640;
  }

  let fromX = opts.fromX ?? toX + 180;
  let fromY = opts.fromY ?? toY + (type === "sword" ? 0 : 180);

  if ((type === "spear" || type === "shuriken") && !opts.fromY) {
    fromX = opts.fromX ?? toX;
    fromY = opts.fromY ?? toY + 180;
  }

  const a: ActiveAttack = {
    id: nextAttackId++,
    weaponId,
    img,
    type,
    phase: preMs > 0 ? "pre" : "run",
    t0: nowMs(),
    ms,
    preMs,
    fromX,
    fromY,
    toX,
    toY,
    element: (enemy.element as string) ?? "none",
  };
  active.push(a);
}

/* ---- split rendering: pre-phase only (splash) ----
   - call this BEFORE drawing enemies to render splash behind them
*/
export function drawAttackPre(p: p5) {
  const t = nowMs();
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    if (a.phase !== "pre") continue;

    const kpre = Math.min(1, (t - a.t0) / Math.max(1, a.preMs));
    // draw elemental splash under target: expanding circle + fade
    drawElementSplash(
      p,
      a.toX,
      a.toY + 4,
      a.element ?? "none",
      1 - Math.pow(kpre, 0.6),
      kpre
    );
    // when pre phase done -> transition to run (important: allow run to be drawn in same frame)
    if (kpre >= 1) {
      a.phase = "run";
      a.t0 = nowMs();
    }
  }
}

/* ---- run-phase only (projectiles / traces) ----
   - call this AFTER drawing enemies to render projectiles above them
   - it also removes finished attacks
*/
export function drawAttackRun(p: p5) {
  const t = nowMs();
  for (let i = active.length - 1; i >= 0; --i) {
    const a = active[i];

    if (a.phase === "pre") {
      // already handled in drawAttackPre; skip here
      continue;
    }

    // run phase
    const k = Math.min(1, (t - a.t0) / Math.max(1, a.ms));

    if (a.type === "sword") {
      const ease = easeOutCubic(k);
      const sx = lerp(a.fromX, a.toX + 12, ease);
      const sy = lerp(a.fromY, a.toY - 6, ease);
      const rot = lerp(0.6, -0.6, ease);
      const alpha = 1 - Math.pow(k, 0.7);

      p.push();
      p.translate(sx, sy);
      p.rotate(rot);
      p.tint(255, 255 * alpha);
      if (a.img) {
        const iw = a.img.width || 64;
        const ih = a.img.height || 64;
        const max = 180;
        const scale = Math.min(1, max / Math.max(iw, ih));
        p.imageMode(p.CENTER);
        p.image(a.img, 0, 0, iw * scale, ih * scale);
      } else {
        p.noStroke();
        p.fill(255, 220 * alpha);
        p.ellipse(0, 0, 36, 18);
      }
      p.pop();

      p.push();
      p.noFill();
      p.stroke(255, 200, 120, 200 * (1 - k));
      p.strokeWeight(3);
      p.line(sx + 28, sy, sx - 28, sy - 8);
      p.pop();
    } else if (a.type === "spear") {
      const ease = easeOutQuad(k);
      const sx = lerp(a.fromX, a.toX, ease);
      const sy = lerp(a.fromY, a.toY, ease);
      const rot = lerp(0.2, -0.05, ease);
      const alpha = 1 - k;

      p.push();
      p.translate(sx, sy);
      p.rotate(rot);
      p.tint(255, 255 * alpha);
      if (a.img) {
        const iw = a.img.width || 32;
        const ih = a.img.height || 32;
        const scale = Math.min(1, 140 / Math.max(iw, ih));
        p.imageMode(p.CENTER);
        p.image(a.img, 0, 0, iw * scale, ih * scale);
      } else {
        p.noStroke();
        p.fill(200, 200 * alpha);
        p.rectMode(p.CENTER);
        p.rect(0, 0, 6, 30);
      }
      p.pop();

      if (k > 0.78) {
        const fk = (k - 0.78) / 0.22;
        p.push();
        p.noFill();
        p.stroke(255, Math.max(0, 220 - fk * 200), 80, 220 * (1 - fk));
        p.strokeWeight(3 * (1 - fk));
        p.circle(a.toX, a.toY, 12 + fk * 36);
        p.pop();
      }
    } else if (a.type === "shuriken") {
      const ease = easeOutCubic(k);
      const sx = lerp(a.fromX, a.toX, ease);
      const sy = lerp(a.fromY, a.toY, ease);
      const spins = 2;
      const angle = ((t - a.t0) / 100) * Math.PI * 2 * spins;
      const alpha = 1 - Math.pow(k, 1.2);

      p.push();
      p.translate(sx, sy);
      p.rotate(angle);
      p.tint(255, 255 * alpha);
      if (a.img) {
        const iw = a.img.width || 24;
        const ih = a.img.height || 24;
        const scale = Math.min(1, 120 / Math.max(iw, ih));
        p.imageMode(p.CENTER);
        p.image(a.img, 0, 0, iw * scale, ih * scale);
      } else {
        p.noStroke();
        p.fill(220, 220 * alpha);
        p.ellipse(0, 0, 18, 18);
      }
      p.pop();

      p.push();
      p.noFill();
      p.stroke(255, 255, 255, 90 * (1 - k));
      p.strokeWeight(2);
      p.line(
        sx + 8,
        sy + 4,
        lerp(sx + 8, a.fromX, 0.5),
        lerp(sy + 4, a.fromY, 0.5)
      );
      p.pop();
    }

    if (k >= 1) {
      active.splice(i, 1);
    }
  }
}

/* helper to draw an elemental splash (expanding circle under target) */
function drawElementSplash(
  p: p5,
  x: number,
  y: number,
  element: string,
  alphaScale: number,
  growth: number
) {
  const color = elementColor(element);
  const maxR = 48;
  const r = 6 + growth * maxR;
  const a = Math.max(0.05, Math.min(1, alphaScale)) * 0.9;
  p.push();
  p.noFill();
  p.stroke(color.r, color.g, color.b, Math.floor(200 * a));
  p.strokeWeight(3 * (1 - growth * 0.7));
  p.circle(x, y, r * 2);
  p.noStroke();
  p.fill(color.r, color.g, color.b, Math.floor(120 * a));
  p.circle(x, y, r * 1.1);
  p.pop();
}

/* elemental palette + helpers (same as before) */
function elementColor(el: string) {
  if (!el) el = "none";
  const map: Record<string, string> = {
    earth: "#129447",
    fire: "#E53935",
    water: "#1E88E5",
    cosmos: "#8E24AA",
    none: "#CCCCCC",
  };
  const hex = map[el] || "#FFFFFF";
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

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}
function easeOutCubic(t: number) {
  t = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - t, 3);
}
function easeOutQuad(t: number) {
  t = Math.max(0, Math.min(1, t));
  return 1 - (1 - t) * (1 - t);
}

/* debug utility */
export function clearAttackAnimations() {
  active.length = 0;
}
export function getActiveAttacks() {
  return active.slice();
}
