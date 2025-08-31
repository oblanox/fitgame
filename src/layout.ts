// src/layout.ts
import { Enemy, Cfg } from "./types";
import { nowMs, easeInOutQuad } from "./animations";

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
export function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

/** Параметры field внутри cfg ожидаются как раньше */
export function getFieldRect(cfg: Cfg) {
  const W = 960, H = 540;
  const f = cfg.field!;
  const fieldW = Math.floor(W * clamp(f.widthRatio ?? 0.35, 0, 1));
  const fieldH = H - (f.padding?.top ?? 40) - (f.padding?.bottom ?? 120);
  const anchor = (f.anchor as string) ?? "center";
  const padLeft = Number(f.padding?.left ?? 0);
  const padRight = Number(f.padding?.right ?? 0);

  let fieldX = 0;
  if (anchor === "left") fieldX = padLeft;
  else if (anchor === "right") fieldX = Math.max(0, W - fieldW - padRight);
  else fieldX = Math.floor((W - fieldW) / 2);

  const fieldY = f.padding?.top ?? 40;
  return { fieldX, fieldY, fieldW, fieldH };
}

export function getRowYs(
  rows: number,
  rect: { fieldX: number; fieldY: number; fieldW: number; fieldH: number },
  field: any
) {
  const insetTop = field.lineInsetTop ?? 14;
  const insetBottom = field.lineInsetBottom ?? 14;
  const usableH = rect.fieldH - insetTop - insetBottom;
  const rowsCount = Math.max(2, rows);
  const stepAuto = usableH / (rowsCount - 1);
  const step = field.lineStep ? Math.min(field.lineStep, stepAuto) : stepAuto;
  const y0 = rect.fieldY + rect.fieldH - insetBottom;
  return Array.from({ length: rowsCount }, (_, i) => y0 - i * step);
}

/**
 * layoutEnemies: рассчитывает позиции и (опционально) применяет их к объектам.
 * Если передан listEnemies -> будет применено к нему. Возвращает список {id,x,y}.
 */
export function layoutEnemies(cfg: Cfg, listEnemies?: Enemy[]) {
  const arr = listEnemies ?? (cfg as any).__enemies as Enemy[]; // main передаёт глобальные enemies либо передаёт список
  if (!arr || !cfg) return [];

  const rect = getFieldRect(cfg);
  const rows = Math.max(2, cfg.field!.rows ?? 5);
  const rowYs = getRowYs(rows, rect, cfg.field!);
  const xAt = (col: number) => rect.fieldX + clamp(col, 0, 1) * rect.fieldW;

  const targets: { id: number; x: number; y: number }[] = [];

  for (const e of arr) {
    const rowIdx = clamp(e.row, 1, rows) - 1;
    const baseY = rowYs[rowIdx] + (e.lineOffset ?? 0);
    const minY = rect.fieldY + e.r;
    const maxY = rect.fieldY + rect.fieldH - e.r;
    const tx = xAt(e.col);
    const ty = clamp(baseY, minY, maxY);

    // mutating current enemy to keep compatibility with previous code
    e.x = tx;
    e.y = ty;
    targets.push({ id: e.id as number, x: tx, y: ty });
  }
  return targets;
}

/** Простая функция сдвига (анимация) */
export function animateShiftToPositions(
  enemiesRef: Enemy[],
  targetPos: { id: number; x: number; y: number }[],
  duration = 360
) {
  const startPositions = new Map<number, { x: number; y: number }>();
  for (const e of enemiesRef) startPositions.set(e.id as number, { x: e.x, y: e.y });
  const start = nowMs();

  function tick() {
    const t = nowMs();
    const k = Math.min(1, (t - start) / duration);
    const ease = easeInOutQuad(k);
    for (const tp of targetPos) {
      const e = enemiesRef.find((x) => x.id === tp.id);
      if (!e) continue;
      const startP = startPositions.get(tp.id) ?? { x: e.x, y: e.y };
      e.x = lerp(startP.x, tp.x, ease);
      e.y = lerp(startP.y, tp.y, ease);
    }
    if (k < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/** Advance formation: если нет никого в первом ряду, двигаем всех вперёд на 1 */
export function advanceFormationIfNeeded(enemiesRef: Enemy[], cfg: Cfg) {
  const frontRow = 1;
  const hasFrontRow = enemiesRef.some((e) => e.row === frontRow);
  if (!hasFrontRow) {
    for (const e of enemiesRef) e.row = Math.max(1, e.row - 1);
    return true;
  }
  return false;
}
