// ui/abilities.ts (фрагменты)
import p5 from "p5";

export type AbilityId = "weapon" | "ab5" | "ab6" | "ab7" | "ab8";

export const ABILITY_TO_ELEMENT: Record<
  Exclude<AbilityId, "weapon">,
  "earth" | "fire" | "water" | "cosmos" | "none"
> = {
  ab5: "fire",
  ab6: "earth",
  ab7: "water",
  ab8: "none",
};

type WeaponTileInfo = {
  img?: p5.Image; // иконка выбранного оружия
  min: number; // базовый min (без стихий)
  max: number; // базовый max (без стихий)
};

let selectedSuper: AbilityId | null = null;
type Hit = { x: number; y: number; r: number; id: AbilityId; enabled: boolean };

export function drawAbilityPanel(
  p: p5,
  x: number,
  y: number,
  w: number,
  data: {
    rule: "t1" | "t2" | "t3";
    weaponTile: WeaponTileInfo; // ← НОВОЕ
    selected?: AbilityId | null;
  }
) {
  const listAll: AbilityId[] = ["weapon", "ab5", "ab6", "ab7", "ab8"]; // ← сначала «оружие»
  const enabledSet = new Set<AbilityId>(["weapon"]); // «weapon» всегда доступен

  // включаем доступные по правилу
  const map: Record<"t1" | "t2" | "t3", AbilityId[]> = {
    t1: ["ab6", "ab8"],
    t2: ["ab7", "ab8"],
    t3: ["ab5", "ab8"],
  };
  (map[data.rule] ?? []).forEach((id) => enabledSet.add(id));

  if (data.selected !== undefined) selectedSuper = data.selected;

  const size = 46,
    gap = 16;
  const totalW = listAll.length * size + (listAll.length - 1) * gap;
  const startX = x + Math.floor((w - totalW) / 2);
  const cy = y + size / 2;

  const ELEMENT_COLOR = {
    earth: "#129447",
    fire: "#E53935",
    water: "#1E88E5",
    cosmos: "#8E24AA",
    none: "#BDBDBD",
  };

  hits.length = 0;

  for (let i = 0; i < listAll.length; i++) {
    const id = listAll[i];
    const enabled = enabledSet.has(id);
    const cx = startX + i * (size + gap);

    // карточка и круг
    p.noStroke();
    p.fill(255);
    p.rect(cx - 2, y - 2, size + 4, size + 4, 10);
    p.fill(enabled ? 248 : 236);
    p.circle(cx + size / 2, cy, size);

    // выделение
    const isSel = selectedSuper === id && enabled;
    if (isSel && id !== "weapon") {
      const el = ABILITY_TO_ELEMENT[id];
      p.noFill();
      p.stroke(ELEMENT_COLOR[el]);
      p.strokeWeight(3);
      p.circle(cx + size / 2, cy, size + 6);
    }
    if (isSel && id === "weapon") {
      p.noFill();
      p.stroke(40);
      p.strokeWeight(3);
      p.circle(cx + size / 2, cy, size + 6);
    }

    // содержимое:
    if (id === "weapon") {
      // иконка оружия + мин–макс под кругом
      if (data.weaponTile.img) {
        p.image(data.weaponTile.img, cx + size / 2 - 16, cy - 22, 32, 32);
      } else {
        p.fill(80);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(12);
        p.text("WEAPON", cx + size / 2, cy);
      }
      p.noStroke();
      p.fill(enabled ? 20 : 140);
      p.textAlign(p.CENTER, p.TOP);
      p.textSize(11);
      p.text(
        `${data.weaponTile.min}–${data.weaponTile.max}`,
        cx + size / 2,
        y + size + 6
      );
    } else {
      // пиктограммы как были (ваши функции); можно оставить простой текст:
      p.noStroke();
      p.fill(enabled ? 20 : 140);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(12);
      p.text(id.toUpperCase(), cx + size / 2, cy);
      // мини‑маркер стихии под подписью
      const el = ABILITY_TO_ELEMENT[id];
      p.textAlign(p.CENTER, p.TOP);
      p.textSize(11);
      p.text(id.toUpperCase(), cx + size / 2, y + size + 6);
      p.noStroke();
      p.fill(ELEMENT_COLOR[el]);
      p.circle(cx + size / 2, y + size + 6 + 12, 6);
    }

    hits.push({ x: cx + size / 2, y: cy, r: size / 2, id, enabled });
  }
}

export function handleAbilityClick(mx: number, my: number): AbilityId | null {
  for (const h of hits) {
    const d = Math.hypot(mx - h.x, my - h.y);
    if (d <= h.r) {
      if (!h.enabled) return null;
      selectedSuper = h.id;
      return h.id;
    }
  }
  return null;
}

export function getSelectedAbility(): AbilityId | null {
  return selectedSuper;
}
export function setSelectedAbility(id: AbilityId | null) {
  selectedSuper = id;
}
