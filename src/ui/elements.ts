// elements.ts — ПАНЕЛЬ ТОЧЕЧНОГО УДАРА (ab1..ab4) + OFF
import p5 from "p5";

export type ElementKey = "earth" | "fire" | "water" | "cosmos" | "none";

// Точечные абилки: 4 стихии + off
export type PointAbilityId = "ab1" | "ab2" | "ab3" | "ab4" | "off";

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
  none: "#FFFFFF",
};

// Порядок отображения кнопок. OFF будет удаляться при debug=false
const ORDER_ALL: PointAbilityId[] = ["ab1", "ab2", "ab3", "ab4"];

let selectedPointAbility: PointAbilityId = "off";
let hitboxes: { x: number; y: number; r: number; id: PointAbilityId }[] = [];

export function drawPointAbilityPanel(
  p: p5,
  opts: {
    x: number;
    y: number;
    w?: number;
    size?: number;
    gap?: number;
    playerElements?: Partial<Record<ElementKey, number>>;
    debug?: boolean;
  }
) {
  const { x, y, w = 360, size = 48, gap = 12, playerElements = {} } = opts;
  hitboxes = [];

  const ORDER =
    opts.debug === false ? ORDER_ALL.filter((id) => id !== "off") : ORDER_ALL;
  const totalW = ORDER.length * size + (ORDER.length - 1) * gap;
  const startX = x + Math.max(0, Math.floor((w - totalW) / 2));
  const cy = y + size / 2;

  ORDER.forEach((id, idx) => {
    const cx = startX + idx * (size + gap);
    const isSel = id === selectedPointAbility;

    // фон рамки
    p.noStroke();
    p.fill(255);
    p.rect(cx - 2, y - 2, size + 4, size + 4, 10);

    // фон круга
    const el = id === "off" ? "none" : POINT_AB_TO_ELEMENT[id];
    p.fill(COLOR[el]);
    p.circle(cx + size / 2, cy, size);

    // --- ВСЕГДА рисуем тонкую обводку вокруг круга для ab1..ab4 (и для off тоже) ---
    // цвет обводки — цвет стихии; если none/white — используем чёрный чтобы был виден
    p.noFill();
    const outlineColor = el === "none" ? "#000" : COLOR[el];
    p.stroke(outlineColor);
    p.strokeWeight(2);
    p.circle(cx + size / 2, cy, size - 2);

    // обводка выделения (если выбран) — оставляем как раньше (оранжевая)
    if (isSel) {
      p.noFill();
      p.stroke("#ff9800");
      p.strokeWeight(3);
      p.circle(cx + size / 2, cy, size + 6);
    }

    // надпись внутри круга
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(Math.floor(size * 0.3));

    if (id === "off") {
      p.fill(0);
      p.text("без\nстихий", cx + size / 2, cy);
    } else {
      const raw = playerElements[el];
      const val =
        typeof raw === "number" && Number.isFinite(raw)
          ? raw > 1.001
            ? raw / 100
            : raw
          : 1;
      const pct = Math.round(Math.max(0, Math.min(5, val)) * 100);
      p.fill(255);
      p.text(`${pct}%`, cx + size / 2, cy);
    }

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
      // Если нажали "off" — перенаправляем выбор на ab1 (пользовательский фоллбек).
      if (h.id === "off") {
        selectedPointAbility = "ab1";
        return "ab1";
      }
      selectedPointAbility = h.id;
      return h.id;
    }
  }
  return null;
}

export function getSelectedPointAbility(): PointAbilityId {
  return selectedPointAbility;
}

export function setSelectedPointAbility(id: PointAbilityId) {
  selectedPointAbility = id;
}

export function getActiveElementFromPointAbility(): ElementKey {
  // Treat "off" as default elemental selection (ab1 -> earth).
  // Это гарантирует, что никогда не будет "none" в качестве активной стихии.
  if (selectedPointAbility === "off") {
    return POINT_AB_TO_ELEMENT["ab1"];
  }
  return POINT_AB_TO_ELEMENT[selectedPointAbility];
}
