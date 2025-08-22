// elements.ts
import p5 from "p5";

// Типы
export type ElementKey = "earth" | "fire" | "water" | "cosmos";

// Цвета для круга
const ELEMENT_COLOR: Record<ElementKey, string> = {
  earth: "#129447", // зелёный
  fire: "#E53935", // красный
  water: "#1E88E5", // синий
  cosmos: "#8E24AA", // фиолетовый
};

// Порядок отображения
const ELEMENTS: ElementKey[] = ["earth", "fire", "water", "cosmos"];

// ===== Состояние =====
let selectedElement: ElementKey = "earth";
let hitboxes: { x: number; y: number; w: number; h: number; el: ElementKey }[] =
  [];

// ===== Отрисовка панели =====
export function drawElementPanel(
  p: p5,
  opts: { x: number; y: number; size?: number; gap?: number }
) {
  const { x, y, size = 48, gap = 12 } = opts;

  hitboxes = [];

  ELEMENTS.forEach((el, i) => {
    const cx = x + i * (size + gap);
    const cy = y;

    const isSelected = el === selectedElement;

    // Подсветка
    if (isSelected) {
      p.stroke("#ff9800");
      p.strokeWeight(3);
    } else {
      p.noStroke();
    }

    p.fill(ELEMENT_COLOR[el]);
    p.circle(cx + size / 2, cy + size / 2, size);

    hitboxes.push({ x: cx, y: cy, w: size, h: size, el });
  });
}

// ===== Обработка кликов =====
export function handleElementClick(mx: number, my: number): ElementKey | null {
  for (const h of hitboxes) {
    if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
      selectedElement = h.el;
      return h.el;
    }
  }
  return null;
}

// ===== Геттер и сеттер =====
export function getSelectedElement(): ElementKey {
  return selectedElement;
}

export function setSelectedElement(el: ElementKey) {
  selectedElement = el;
}
