import p5 from "p5";

// Типы
export type WeaponKind = "short" | "long" | "throw";

export type Weapon = {
  id: number;
  kind: WeaponKind;
};

export type WeaponPanelCfg = {
  weapons: Weapon[];
  selectedId: number;
};

// ===== Состояние =====
let selectedId: number = 1;
let currentWeapons: Weapon[] = [];
let hitboxes: { id: string; x: number; y: number; w: number; h: number }[] = [];

// ===== Иконки =====
const icons: Partial<Record<WeaponKind, p5.Image>> = {};

export function preloadWeaponIcons(p: p5) {
  try {
    icons.short = p.loadImage("assets/weapon_short.png");
  } catch {}
  try {
    icons.long = p.loadImage("assets/weapon_long.png");
  } catch {}
  try {
    icons.throw = p.loadImage("assets/weapon_throw.png");
  } catch {}
}

function drawVectorIcon(
  p: p5,
  x: number,
  y: number,
  size: number,
  kind: WeaponKind
) {
  p.push();
  p.stroke("#1d1d1d");
  p.strokeWeight(3);
  p.noFill();
  const cx = x + size / 2,
    cy = y + size / 2;
  if (kind === "short") {
    p.line(cx, y + 6, cx, y + size - 6);
    p.line(cx - 10, y + size - 12, cx + 10, y + size - 12);
  } else if (kind === "long") {
    p.line(x + 8, cy, x + size - 8, cy);
    p.line(x + size - 12, cy - 8, x + size - 8, cy);
    p.line(x + size - 12, cy + 8, x + size - 8, cy);
  } else {
    p.line(x + 10, cy, x + size - 12, cy);
    p.triangle(x + size - 12, cy - 6, x + size - 12, cy + 6, x + size - 2, cy);
  }
  p.pop();
}

function drawWeaponIcon(
  p: p5,
  x: number,
  y: number,
  size: number,
  kind: WeaponKind
) {
  const icon = icons[kind];
  if (icon) p.image(icon, x, y, size, size);
  else drawVectorIcon(p, x, y, size, kind);
}

// ===== Основной отрисовщик =====
export function drawWeaponPanel(
  p: p5,
  cfg: WeaponPanelCfg,
  opts: { x: number; y: number; gap?: number; size?: number }
) {
  const { x, y, gap = 12, size = 34 } = opts;
  const items = cfg.weapons;
  currentWeapons = items;
  selectedId = cfg.selectedId;

  hitboxes = [];

  for (let i = 0; i < items.length; i++) {
    const w = items[i];
    const bx = x + i * (size + gap);
    const by = y;

    // Обводка если выбрано
    if (w.id === selectedId) {
      p.noFill();
      p.stroke("#ff6600");
      p.strokeWeight(3);
      p.rect(bx - 2, by - 2, size + 4, size + 4, 6);
    }

    drawWeaponIcon(p, bx, by, size, w.kind);

    // hitbox
    hitboxes.push({ id: `weapon-${w.id}`, x: bx, y: by, w: size, h: size });
  }
}

// ===== Обработка кликов =====
export function handleWeaponClick(mx: number, my: number): number | null {
  for (const r of hitboxes) {
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      const id = Number(r.id.replace("weapon-", ""));
      selectedId = id;
      return id;
    }
  }
  return null;
}

export function getSelectedWeapon(): Weapon | null {
  return currentWeapons.find((w) => w.id === selectedId) ?? null;
}

// ===== Преобразование WeaponCfg[] → Weapon[] для панели =====
export function getWeapons(cfg: any): Weapon[] {
  const raw: any[] = Array.isArray(cfg?.weapons) ? cfg.weapons : [];

  const detectKind = (w: any): WeaponKind => {
    const raw = (w?.kind ?? w?.type ?? w?.rangeType ?? "")
      .toString()
      .toLowerCase();
    if (
      raw.includes("throw") ||
      raw.includes("мет") ||
      raw.includes("дальн") ||
      raw.includes("брос")
    )
      return "throw";
    if (raw.includes("long") || raw.includes("длин")) return "long";
    if (raw.includes("short") || raw.includes("корот")) return "short";
    if (w?.id === 1) return "short";
    if (w?.id === 2) return "long";
    return "throw";
  };

  return raw.map((w, i) => ({
    id: Number(w?.id ?? i + 1),
    kind: detectKind(w),
  }));
}
