// elements.ts — ПАНЕЛЬ ТОЧЕЧНОГО УДАРА (ab1..ab4) + OFF
import p5 from "p5";

export type ElementKey = "earth" | "fire" | "water" | "cosmos";

// Точечные абилки: 4 стихии + off
export type PointAbilityId = "ab1" | "ab2" | "ab3" | "ab4"; // ← без off
// соответствие абилки → стихия
const POINT_AB_TO_ELEMENT: Record<
  Exclude<PointAbilityId, "off">,
  ElementKey
> = {
  ab1: "earth",
  ab2: "fire",
  ab3: "water",
  ab4: "cosmos",
};

const COLOR: Record<ElementKey, string> = {
  earth: "#129447",
  fire: "#E53935",
  water: "#1E88E5",
  cosmos: "#8E24AA",
};

const ORDER: PointAbilityId[] = ["ab1", "ab2", "ab3", "ab4"];

let selectedPointAbility: PointAbilityId = "ab1";
let hitboxes: { x: number; y: number; r: number; id: PointAbilityId }[] = [];

// ПОСЛЕ
export function drawPointAbilityPanel(
  p: p5,
  opts: {
    x: number;
    y: number;
    w?: number;
    size?: number;
    gap?: number;
    playerElements?: Partial<Record<ElementKey, number>>;
  }
) {
  const { x, y, w = 360, size = 48, gap = 12, playerElements = {} } = opts;
  hitboxes = [];

  const totalW = ORDER.length * size + (ORDER.length - 1) * gap;
  const startX = x + Math.max(0, Math.floor((w - totalW) / 2));
  const cy = y + size / 2;

  ORDER.forEach((id, idx) => {
    const cx = startX + idx * (size + gap);
    const isSel = id === selectedPointAbility;

    p.noStroke();
    p.fill(255);
    p.rect(cx - 2, y - 2, size + 4, size + 4, 10);

    // фон круга
    const el = POINT_AB_TO_ELEMENT[id];
    const pct = Math.round((playerElements[el] ?? 1) * 100);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(Math.floor(size * 0.34));
    p.fill(255);
    p.text(`${pct}%`, cx + size / 2, cy);

    // обводка выбора
    if (isSel) {
      p.noFill();
      p.stroke("#ff9800");
      p.strokeWeight(3);
      p.circle(cx + size / 2, cy, size + 6);
    }

    // надпись внутри круга
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(Math.floor(size * 0.34));

    p.fill(255);
    p.text(`${pct}%`, cx + size / 2, cy); // ← теперь процент
    hitboxes.push({ x: cx + size / 2, y: cy, r: size / 2, id });
  });
}

export function handlePointAbilityClick(
  mx: number,
  my: number
): PointAbilityId | null {
  for (const h of hitboxes) {
    const d = Math.hypot(mx - h.x, my - h.y);
    if (d <= h.r) {
      selectedPointAbility = h.id;
      return h.id;
    }
  }
  return null;
}

export function setSelectedPointAbility(id: PointAbilityId) {
  selectedPointAbility = id;
}

// вернуть активную стихию для удара: ab1..ab4 → её стихия, off → "none"
export function getActiveElementFromPointAbility(): ElementKey {
  return POINT_AB_TO_ELEMENT[selectedPointAbility];
}
