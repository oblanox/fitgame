// src/ui/glyphs/ab0.ts
import type p5 from "p5";
import { getActiveElementFromPointAbility } from "../elements";
import { getSelectedWeapon } from "../weapons";

/**
 * Glyph module for AB0 (weapon/glyph).
 * Exports:
 *  - preloadAb0Glyph(p)
 *  - ab0Glyph(p, cx, cy, r, enabled, weaponImg?)
 *  - triggerAb0Anim(id?, ms?)
 *  - isAb0Animating(id?)
 *
 * This version prefers a weaponImg argument passed by caller. If absent,
 * it falls back to internally preloaded selectedIcons indexed by selected weapon id.
 * It logs image source info a few times for debugging.
 */

/* simple asset store (same filenames as before) */
const selectedIcons: Record<number, p5.Image | undefined> = {};

/** Toggle debug rect drawing (set to false after verification) */
const DEBUG_DRAW_RECT = true;
const GLYPH_BIG = true;

/** Preload images used by glyph (call in setup) */
export function preloadAb0Glyph(p: p5) {
  try {
    selectedIcons[1] = p.loadImage("assets/icon_weapon_selected_1.png");
    selectedIcons[2] = p.loadImage("assets/icon_weapon_selected_2.png");
    selectedIcons[3] = p.loadImage("assets/icon_weapon_selected_3.png");
  } catch (e) {
    // ignore
  }
}

/* small animation state */
type AnimState = {
  t0: number;
  ms: number;
  angleFrom: number;
  angleTo: number;
  dxFrom: number;
  dxTo: number;
};
const anims = new Map<string | number, AnimState>();
function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
export function triggerAb0Anim(id: string | number = "ab0", ms = 420) {
  anims.set(id, {
    t0: nowMs(),
    ms,
    angleFrom: -0.12,
    angleTo: 0.18,
    dxFrom: 0,
    dxTo: 8,
  });
}
export function isAb0Animating(id: string | number = "ab0") {
  const st = anims.get(id);
  if (!st) return false;
  const k = Math.min(1, (nowMs() - st.t0) / st.ms);
  return k < 1;
}
function easeOutBack(t: number) {
  t = Math.max(0, Math.min(1, t));
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* simple hex -> rgb helper */
function hexToRgb(hex: string) {
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

/* elemental colors (keep in sync with project) */
const ELEMENT_COLOR: Record<string, string> = {
  earth: "#129447",
  fire: "#E53935",
  water: "#1E88E5",
  cosmos: "#8E24AA",
  none: "#FFFFFF",
};

/**
 * ab0Glyph
 * - p: p5 instance
 * - cx, cy: center where glyph should be drawn (matches existing glyph signature)
 * - r: radius-ish (the original code passed size*0.42, adapt as needed)
 * - enabled: whether the ability is enabled (for visual state)
 * - weaponImg: optional image passed from caller (preferred)
 */
export function ab0Glyph(
  p: p5,
  cx: number,
  cy: number,
  r: number,
  enabled: boolean,
  weaponImg?: p5.Image
) {
  // compute glyph rect consistent with abilities.ts calculations:
  const glyphR = r; // caller normally passes scaled value already
  const w = glyphR * 1.8;
  const h = w;
  const x = cx - w / 2;
  const y = cy - h / 2;

  // animation read
  let angle = 0;
  let dx = 0;
  const st = anims.get("ab0");
  if (st) {
    const k = Math.min(1, (nowMs() - st.t0) / st.ms);
    const ke = easeOutBack(k);
    angle = st.angleFrom + (st.angleTo - st.angleFrom) * ke;
    dx = st.dxFrom + (st.dxTo - st.dxFrom) * ke;
    if (k >= 1) anims.delete("ab0");
  }

  // prefer internally preloaded selectedIcons for the selected weapon;
  // fallback to the weaponImg passed by the caller only if internal icon absent.
  let img: p5.Image | undefined = undefined;
  let imgSource = "none";
  const sel = getSelectedWeapon?.();
  if (sel && !GLYPH_BIG) {
    const cached = selectedIcons[sel.id as number];
    if (cached) {
      img = cached;
      imgSource = "internal_selectedIcons";
    }
  }
  if (!img && weaponImg) {
    img = weaponImg;
    imgSource = "weaponImg";
  }

  // debug log first few frames
  try {
    const cnt = (window as any).__ab0_img_log_count || 0;
    if (cnt < 6) {
      console.log(
        "[ab0Glyph] image source=",
        imgSource,
        "weaponImgPresent=",
        !!weaponImg,
        "selectedWeaponId=",
        getSelectedWeapon?.()?.id ?? null,
        "imgExists=",
        !!img
      );
      (window as any).__ab0_img_log_count = cnt + 1;
    }
  } catch (e) {}

  p.push();
  // background container (rounded)
  p.noStroke();
  p.fill(enabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)");
  p.rect(x, y, w, h, 10);

  // border
  p.noFill();
  p.stroke(255, 255, 255, enabled ? 180 : 60);
  p.strokeWeight(enabled ? 2 : 1);
  p.rect(x + 0.5, y + 0.5, w - 1, h - 1, 10);

  // center for icon (slightly above center)
  const icx = cx + dx;
  const icy = cy - h * 0.08;

  p.push();
  p.translate(icx, icy);
  p.rotate(angle);

  if (img) {
    p.imageMode(p.CENTER);
    // fit the image into the glyph box; protect against 0-sized images
    const drawW = Math.min(w * 0.92, Math.max(1, img.width || w * 0.5));
    const drawH = Math.min(h * 0.92, Math.max(1, img.height || h * 0.5));
    p.image(img, 0, 0, drawW, drawH);
  } else {
    // nicer fallback: colored circle using current element (or default)
    const elFb = (getActiveElementFromPointAbility?.() ?? "none") as string;
    const colorHex = ELEMENT_COLOR[elFb] ?? "#888";
    const rgb = hexToRgb(colorHex);
    p.noStroke();
    p.fill(rgb.r, rgb.g, rgb.b, 200);
    p.circle(0, 0, Math.min(w, h) * 0.9);
    // small inner highlight
    p.fill(255, 255, 255, 40);
    p.circle(
      -Math.max(4, Math.round(w * 0.06)),
      -Math.max(6, Math.round(h * 0.08)),
      Math.min(w, h) * 0.18
    );
  }
  p.pop();

  // elemental ring + badge (only when element != none)
  const el = (getActiveElementFromPointAbility?.() ?? "none") as string;
  if (el !== "none") {
    const elColor = ELEMENT_COLOR[el] ?? "#FFFFFF";
    const rgb = hexToRgb(elColor);
    p.push();
    p.noFill();
    p.stroke(rgb.r, rgb.g, rgb.b, 120);
    p.strokeWeight(3);
    p.circle(icx, icy, Math.min(w, h) * 1.04);

    // badge bottom-left
    const badgeR = Math.round(Math.min(w, h) * 0.18);
    p.noStroke();
    p.fill(elColor);
    p.circle(x + badgeR + 6, y + h - badgeR - 6, badgeR * 2);
    p.fill(255);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(Math.max(9, Math.round(badgeR * 0.7)));
    p.text(el[0].toUpperCase(), x + badgeR + 6, y + h - badgeR - 6);
    p.pop();
  }

  // DEBUG: draw glyph rect (temporary) — remove after verification
  if (DEBUG_DRAW_RECT) {
    p.push();
    p.noFill();
    p.stroke(255, 0, 255, 60);
    p.strokeWeight(1);
    p.rect(x, y, w, h);
    p.pop();
  }

  // damage text under glyph: use global helper if available
  let damageText = "";
  if (typeof (window as any).getAbilityDamageText === "function") {
    try {
      damageText = (window as any).getAbilityDamageText();
    } catch {}
  }
  p.push();
  p.noStroke();
  p.fill("#111");
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(Math.max(10, Math.round(h * 0.12)));
  p.text(damageText, cx, y + h + 12);
  p.pop();

  p.pop();
}
