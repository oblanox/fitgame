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
  const W = 960,
    H = 540;
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
// вставить в src/layout.ts — заменяет прежнюю функцию layoutEnemies / логику Y-позиционирования

export function layoutEnemies(cfg: Cfg, listEnemies?: Enemy[]) {
  const arr = listEnemies ?? ((cfg as any).__enemies as Enemy[]);
  if (!arr || !cfg) return [];

  const rect = getFieldRect(cfg);
  const rows = Math.max(2, cfg.field!.rows ?? 5);
  const rowYs = getRowYs(rows, rect, cfg.field!);
  const xAt = (col: number) => rect.fieldX + clamp(col, 0, 1) * rect.fieldW;

  // ensure every enemy has r (defensive)
  for (const e of arr) {
    (e as any).r = Number((e as any).r ?? (e as any).radius ?? 30);
  }

  // Build per-row members and initial positions (x,y)
  const rowsMap = new Map<number, Enemy[]>();
  for (const e of arr) {
    const r = Math.max(1, Math.min(rows, Number(e.row ?? 1)));
    if (!rowsMap.has(r)) rowsMap.set(r, []);
    rowsMap.get(r)!.push(e);
  }

  // Initial per-enemy x and base y (rowY + lineOffset)
  type Placed = {
    e: Enemy;
    x: number;
    baseY: number;
    relOffset: number;
    r: number;
  };
  const rowPlaced = new Map<number, Placed[]>();
  for (let r = 1; r <= rows; r++) {
    const members = rowsMap.get(r) ?? [];
    if (members.length === 0) continue;
    // compute avg offset to preserve intra-row layout while allowing row-wise shifts
    const offsets = members.map((m) => Number(m.lineOffset ?? 0));
    const avgOffset = offsets.length
      ? offsets.reduce((a, b) => a + b, 0) / offsets.length
      : 0;
    const baseRowY = rowYs[Math.max(0, Math.min(rows - 1, r - 1))];
    const placed: Placed[] = members.map((m) => {
      const x = xAt(m.col);
      const rel = Number(m.lineOffset ?? 0) - avgOffset; // per-member relative offset to row center
      const baseY = baseRowY + avgOffset; // row center (we'll add rel later)
      return { e: m, x, baseY, relOffset: rel, r: Number(m.r ?? 0) };
    });
    rowPlaced.set(r, placed);
  }

  // We'll iterate rows from front (1) to back (increasing index).
  // For each row we compute adjusted center (rowCenter), initialized to baseRow center,
  // and then, if any placed would intersect already placed previous-members, we lower (decrease y) it.
  const MIN_VERTICAL_GAP = Number((cfg as any).rules?.minRowGap ?? 6); // px, can be from cfg.rules
  const placedPrev: { x: number; y: number; r: number }[] = []; // already-fixed items

  const targets: { id: number; x: number; y: number }[] = [];

  for (let r = 1; r <= rows; r++) {
    const placed = rowPlaced.get(r);
    if (!placed || placed.length === 0) continue;

    // current row center candidate (we keep per-row center as average of placed.baseY)
    const rowCenterCandidate =
      placed.reduce((s, p) => s + p.baseY, 0) / placed.length;

    // We want to compute the minimum allowed center (i.e., the smallest y value)
    // that still avoids overlaps with all previously fixed circles.
    // For each member in this row and for each prev item compute constraint:
    // if dx < rSum+GAP then required dy >= sqrt((rSum+GAP)^2 - dx^2)
    // meaning prevY - currCenter >= requiredDy => currCenter <= prevY - requiredDy
    let tightestCenter = rowCenterCandidate; // we will only move up (decrease y) if needed

    for (const p of placed) {
      // p.x is current member x, p.r is radius
      // we need the minimal center (across all prev items) that satisfies all constraints
      let bestForMember = rowCenterCandidate;
      for (const q of placedPrev) {
        const dx = Math.abs(q.x - p.x);
        const rsumGap = q.r + p.r + MIN_VERTICAL_GAP;
        if (dx >= rsumGap) {
          // no constraint from this prev item
          continue;
        }
        // compute required vertical separation
        const sq = rsumGap * rsumGap - dx * dx;
        const needDy = sq <= 0 ? 0 : Math.sqrt(sq);
        // prevY - currCenter >= needDy  => currCenter <= prevY - needDy
        const allowedCenter = q.y - needDy;
        if (allowedCenter < bestForMember) bestForMember = allowedCenter;
      }
      // the row center must satisfy ALL members, so we pick the minimum across members
      if (bestForMember < tightestCenter) tightestCenter = bestForMember;
    }

    // clamp so row doesn't go above top limit
    const topLimit = rect.fieldY + Math.max(...placed.map((p) => p.r));
    if (tightestCenter < topLimit) tightestCenter = topLimit;

    // Apply adjusted centers to members (preserve their relative offsets)
    for (const p of placed) {
      let ty = tightestCenter + p.relOffset;
      const minY = rect.fieldY + p.r;
      const maxY = rect.fieldY + rect.fieldH - p.r;
      ty = Math.max(minY, Math.min(maxY, ty));
      p.e.x = p.x;
      p.e.y = ty;
      targets.push({ id: p.e.id as number, x: p.x, y: ty });
      placedPrev.push({ x: p.x, y: ty, r: p.r });
    }
  }

  const existingIds = new Set(targets.map((t) => t.id));
  for (const e of arr) {
    if (!existingIds.has(e.id as number)) {
      const tx = xAt(e.col);
      const rowIdx = Math.max(0, Math.min(rows - 1, Number(e.row ?? 1) - 1));
      const base = rowYs[rowIdx] + (e.lineOffset ?? 0);
      const minY = rect.fieldY + e.r;
      const maxY = rect.fieldY + rect.fieldH - e.r;
      const ty = Math.max(minY, Math.min(maxY, base));
      e.x = tx;
      e.y = ty;
      targets.push({ id: e.id as number, x: tx, y: ty });
    }
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
  for (const e of enemiesRef)
    startPositions.set(e.id as number, { x: e.x, y: e.y });
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

/** Compact rows: сжимаем непустые ряды к переду, убирая пустые промежутки
 *
 *  Пример: если живые враги были в рядах [2,4] -> станет [1,2].
 *  Возвращает true, если были изменения (полезно решать, вызывать ли анимацию сдвига).
 */
export function advanceFormationIfNeeded(enemiesRef: Enemy[], cfg: Cfg) {
  if (!enemiesRef || enemiesRef.length === 0) return false;
  if (!cfg) return false;

  // Собираем живых (hp > 0)
  const alive = enemiesRef.filter((e) => (e.hp ?? 0) > 0);
  if (alive.length === 0) return false;

  // уникальные номера рядов, где есть живые
  const rowsSet = Array.from(new Set(alive.map((e) => Number(e.row)))).sort(
    (a, b) => a - b
  );

  // если уже компактно (1..n) — ничего не делаем
  let alreadyCompact = true;
  for (let i = 0; i < rowsSet.length; i++) {
    if (rowsSet[i] !== i + 1) {
      alreadyCompact = false;
      break;
    }
  }
  if (alreadyCompact) return false;

  // mapping oldRow -> newRow (1..n) - под вопросом(?)
  const mapping = new Map<number, number>();
  rowsSet.forEach((r, idx) => mapping.set(r, idx + 1));

  // применяем маппинг ко всем живым врагам
  let changed = false;
  for (const e of enemiesRef) {
    if ((e.hp ?? 0) <= 0) continue;
    const cur = Number(e.row ?? 1);
    const nxt = mapping.get(cur) ?? cur;
    if (cur !== nxt) {
      e.row = nxt;
      changed = true;
    }
  }

  return changed;
}
