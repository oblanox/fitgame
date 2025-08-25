import p5 from "p5";
import { ElementKey } from "./elements";

// Плоская матрица: attacker → defender → coef
export type ElementMatrixCfg = Record<ElementKey, Record<ElementKey, number>>;

/**
 * БАЗОВЫЕ РАЗМЕРЫ МАКЕТА КАРТИНКИ
 * Координаты ниже заданы под макет ~240×180 px (assets/elements_schema_base.png).
 * Если у реального изображения ширина/высота отличаются — мы аккуратно масштабируем позиции.
 */
const BASE_W = 240;
const BASE_H = 180;

// Общие смещения для тонкой подгонки всех подписей единой ручкой
const DX = 0; // можно быстро целиком сдвинуть по X
const DY = 0; // и по Y

// Точечные смещения по группам (чтобы ровнять легко)
const OFFSET = {
  top: { x: 0, y: -2 }, // 0.2 / 0.3 / 0.5 над дугами
  inner: { x: 0, y: -2 }, // три «0.5» между соседями (верх)
  innerR: { x: 0, y: 2 }, // три «2.0» между соседями (низ)
  bottom: { x: 0, y: 4 }, // 8.0 / 4.0 / 2.0 под дугами
} as const;

// Фиксированные позиции (под базовый макет). Координаты максимально выровнены под изображение.
// Разнесены по логическим группам, чтобы было удобно редактировать.
const labelPositions: Array<{
  attacker: ElementKey;
  defender: ElementKey;
  x: number;
  y: number;
  group: keyof typeof OFFSET;
}> = [
  // ── Верхние дуги (к Cosmos) ────────────────────────────────────────────────
  { attacker: "earth", defender: "cosmos", x: 118, y: 18, group: "top" },
  { attacker: "fire", defender: "cosmos", x: 165, y: 36, group: "top" },
  { attacker: "water", defender: "cosmos", x: 190, y: 74, group: "top" },

  // ── Внутренние стрелки (основной треугольник) ────────────────────────────
  { attacker: "earth", defender: "fire", x: 50, y: 74, group: "inner" }, // 0.5
  { attacker: "fire", defender: "water", x: 121, y: 74, group: "inner" }, // 0.5
  { attacker: "water", defender: "earth", x: 70, y: 145, group: "inner" }, // 0.5

  // ── Обратные стрелки (второй контур треугольника) ────────────────────────
  { attacker: "fire", defender: "earth", x: 50, y: 105, group: "innerR" }, // 2.0
  { attacker: "water", defender: "fire", x: 121, y: 105, group: "innerR" }, // 2.0
  { attacker: "earth", defender: "water", x: 74, y: 32, group: "innerR" }, // 2.0

  // ── Cosmos → все (нижние дуги) ────────────────────────────────────────────
  { attacker: "cosmos", defender: "earth", x: 118, y: 165, group: "bottom" }, // 8.0
  { attacker: "cosmos", defender: "fire", x: 170, y: 140, group: "bottom" }, // 4.0
  { attacker: "cosmos", defender: "water", x: 190, y: 105, group: "bottom" }, // 2.0
];

let schemaImg: p5.Image | null = null;

export function preloadElementSchema(p: p5) {
  if (!schemaImg) schemaImg = p.loadImage("assets/elements_schema_base.png");
}

/**
 * Рисует схему стихий по центру блока шириной w.
 * @param p   p5
 * @param x   левый край области
 * @param y   верхняя точка размещения схемы
 * @param w   ширина области (для центрирования)
 * @param matrix  коэффициенты attacker→defender
 */
export function drawElementSchema(
  p: p5,
  x: number,
  y: number,
  w: number,
  matrix: ElementMatrixCfg
) {
  // 1) Рисуем картинку
  const schemaW = schemaImg ? schemaImg.width : BASE_W;
  const schemaH = schemaImg ? schemaImg.height : BASE_H;
  const sx = x + Math.floor((w - schemaW) / 2);
  const sy = y;
  if (schemaImg) p.image(schemaImg, sx, sy, schemaW, schemaH);

  // 2) Масштаб для координат (если картинка не 240×180)
  const scaleX = schemaW / BASE_W;
  const scaleY = schemaH / BASE_H;

  // 3) Подписи коэффициентов
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(12); // чуть меньше = аккуратнее
  p.stroke(255); // тонкий белый обвод для читабельности
  p.strokeWeight(2 / Math.max(scaleX, scaleY));
  p.fill(0);

  for (const pos of labelPositions) {
    const v = matrix[pos.attacker]?.[pos.defender];
    const val = Number.isFinite(v) ? (v as number).toFixed(1) : "1.0";

    const g = OFFSET[pos.group];
    const px = sx + (pos.x + DX + g.x) * scaleX;
    const py = sy + (pos.y + DY + g.y) * scaleY;

    p.text(val, px, py);
  }

  // 4) Если нужно отладить координаты — включить маркеры (true - рисует точки)
  const DEBUG_POINTS = false;
  if (DEBUG_POINTS) {
    p.noStroke();
    p.fill(255, 0, 0);
    for (const pos of labelPositions) {
      const g = OFFSET[pos.group];
      const px = sx + (pos.x + DX + g.x) * scaleX;
      const py = sy + (pos.y + DY + g.y) * scaleY;
      p.circle(px, py, 3);
    }
  }
}
