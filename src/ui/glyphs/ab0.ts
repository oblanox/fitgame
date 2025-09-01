import type p5 from "p5";
import { getActiveElementFromPointAbility } from "../elements";
import { getSelectedWeapon } from "../weapons";

const selectedIcons: Record<number, p5.Image | undefined> = {};
const DEBUG_DRAW_RECT = false;
const GLYPH_BIG = true;

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
const ELEMENT_COLOR: Record<string, string> = {
  earth: "#129447",
  fire: "#E53935",
  water: "#1E88E5",
  cosmos: "#8E24AA",
  none: "#FFFFFF",
};
export function ab0Glyph(
  p: p5,
  cx: number,
  cy: number,
  r: number,
  enabled: boolean,
  weaponImg?: p5.Image
) {
  const glyphR = r;
  const w = glyphR * 1.8;
  const h = w;
  const x = cx - w / 2;
  const y = cy - h / 2;
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
  try {
    const cnt = (window as any).__ab0_img_log_count || 0;
    if (cnt < 6) {
      (window as any).__ab0_img_log_count = cnt + 1;
    }
  } catch (e) {}
  p.push();
  p.noStroke();
  p.fill(enabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)");
  p.rect(x, y, w, h, 10);
  p.noFill();
  p.stroke(255, 255, 255, enabled ? 180 : 60);
  p.strokeWeight(enabled ? 2 : 1);
  p.rect(x + 0.5, y + 0.5, w - 1, h - 1, 10);
  const icx = cx + dx;
  const icy = cy - h * 0.08;
  p.push();
  p.translate(icx, icy);
  p.rotate(angle);
  if (img) {
    p.imageMode(p.CENTER);
    const drawW = Math.min(w * 0.92, Math.max(1, img.width || w * 0.5));
    const drawH = Math.min(h * 0.92, Math.max(1, img.height || h * 0.5));
    p.image(img, 0, 0, drawW, drawH);
  } else {
    const elFb = (getActiveElementFromPointAbility?.() ?? "none") as string;
    const colorHex = ELEMENT_COLOR[elFb] ?? "#888";
    const rgb = hexToRgb(colorHex);
    p.noStroke();
    p.fill(rgb.r, rgb.g, rgb.b, 200);
    p.circle(0, 0, Math.min(w, h) * 0.9);
    p.fill(255, 255, 255, 40);
    p.circle(
      -Math.max(4, Math.round(w * 0.06)),
      -Math.max(6, Math.round(h * 0.08)),
      Math.min(w, h) * 0.18
    );
  }
  p.pop();
  const el = (getActiveElementFromPointAbility?.() ?? "none") as string;
  if (el !== "none") {
    const elColor = ELEMENT_COLOR[el] ?? "#FFFFFF";
    const rgb = hexToRgb(elColor);
    p.push();
    p.noFill();
    p.stroke(rgb.r, rgb.g, rgb.b, 120);
    p.strokeWeight(3);
    p.circle(icx, icy, Math.min(w, h) * 1.04);
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
  if (DEBUG_DRAW_RECT) {
    p.push();
    p.noFill();
    p.stroke(255, 0, 255, 60);
    p.strokeWeight(1);
    p.rect(x, y, w, h);
    p.pop();
  }
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
