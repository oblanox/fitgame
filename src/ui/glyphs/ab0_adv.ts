// src/ui/ab0_adv.ts
import type p5 from "p5";
import { ElementKey } from "../../types";

// Простая таблица цветов (совпадает с main.ts цветами)
const ELEMENT_COLOR: Record<ElementKey, string> = {
  earth: "#129447",
  fire: "#E53935",
  water: "#1E88E5",
  cosmos: "#8E24AA",
  none: "#FFFFFF",
};

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const bigint = parseInt(
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m,
    16
  );
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export type Ab0AdvOpts = {
  // картинка оружия (p5.Image) — предпочти передать готовую картинку
  img?: p5.Image | null;
  // выбранная стихия ("earth","fire","water","cosmos","none")
  element?: ElementKey;
  // ширина/высота панели — дефолт 64x128
  w?: number;
  h?: number;
  // включить/выключить анимацию колыхания
  animate?: boolean;
  // флаг рисовать фон (по умолчанию true)
  drawBg?: boolean;
  // опциональная подпись (строка) — рисуется под картинкой
  label?: string | null;
};

/**
 * drawAb0Adv — рисует расширенную панель оружия + большой глиф.
 * - p: p5
 * - x,y — левый верхний угол панели (как в drawSelectedWeaponIcon)
 * - opts — параметры (img, element, w=164, h=128)
 */
export function drawAb0Adv(p: p5, x: number, y: number, opts: Ab0AdvOpts = {}) {
  const {
    img = null,
    element = "none",
    w = 64,
    h = 128,
    animate = true,
    drawBg = true,
    label = null,
  } = opts;

  // центр панели -> для удобства
  const cx = x + w / 2;
  const cy = y + h / 2;

  // лёгкая анимация колыхания
  const dy = animate ? Math.sin((p.frameCount || 0) / 10) * 2.5 : 0;

  // фон панели
  p.push();
  if (drawBg) {
    p.noStroke();
    // слегка прозрачный фон
    //p.fill(255, 240);
    //p.rect(x, y, w, h, 10);
    // тонкая внутренняя рамка
    p.noFill();
    p.stroke(0, 8);
    p.strokeWeight(1);
    p.rect(x + 0.5, y + 0.5, w - 1, h - 1, 10);
  }

  // подчёркивающая линия (под картинкой)
  p.pop();

  // рисуем картинку оружия (заставляем 64x128)
  p.push();
  p.translate(cx, cy + dy * 0.6);
  if (img) {
    p.imageMode(p.CENTER);
    // жёсткая подгонка под 64x128 (по ТЗ)
    const drawW = w * 0.95;
    const drawH = h * 0.95;
    p.image(img, 0, 0, drawW, drawH);
  } else {
    // fallback: круг того же цвета стихии
    const col = ELEMENT_COLOR[element] ?? "#888";
    const rgb = hexToRgb(col);
    p.noStroke();
    p.fill(rgb.r, rgb.g, rgb.b, 220);
    p.circle(0, 0, Math.min(w, h) * 0.84);
  }
  p.pop();

  // тонкий цветной ореол/контур по стихии (если есть)
  if (element !== "none") {
    const elColor = ELEMENT_COLOR[element] ?? "#FFFFFF";
    const rgb = hexToRgb(elColor);
    p.push();
    p.noFill();
    p.stroke(rgb.r, rgb.g, rgb.b, 120);
    p.strokeWeight(3);
    p.circle(cx, cy + dy * 0.6, Math.min(w, h) * 1.02);
    p.pop();
  }

  // маленький значок-гэш (в правом верхнем углу панели) — цвет стихии + буква
  const badgeR = Math.round(Math.min(w, h) * 0.14);
  const badgeX = x + w - badgeR - 8;
  const badgeY = y + badgeR + 8;
  p.push();
  p.noStroke();
  const badgeFill = ELEMENT_COLOR[element] ?? "#999";
  const rgbBadge = hexToRgb(badgeFill);
  p.fill(rgbBadge.r, rgbBadge.g, rgbBadge.b, 240);
  p.circle(badgeX, badgeY, badgeR * 2);
  p.fill(255);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(Math.max(10, Math.round(badgeR * 0.8)));
  p.text(element[0].toUpperCase(), badgeX, badgeY);
  p.pop();

  // опциональная подпись (например "Атака: 12-18") — размещается под панелью
  if (label) {
    p.push();
    p.noStroke();
    p.fill(20);
    p.textAlign(p.CENTER, p.TOP);
    p.textSize(12);
    p.text(label, x + w / 2, y + h + 6);
    p.pop();
  }
}
