// ui/abilities.ts — ПАНЕЛЬ СУПЕРУДАРОВ (ab5..ab8) + кнопка удара (ab0)
import p5 from "p5";
import { ab0Glyph } from "./glyphs/ab0";
import { drawAb0Adv } from "./glyphs/ab0_adv";
import { getActiveElementFromPointAbility } from "./elements";

export type AbilityId = "ab5" | "ab6" | "ab7" | "ab8" | "ab0";
export type WeaponRule = "t1" | "t2" | "t3";

// Связь суперударов с их стихией (для подсветки)
export const ABILITY_TO_ELEMENT: Record<
  AbilityId,
  "earth" | "fire" | "water" | "cosmos" | "none" | "clear"
> = {
  ab5: "fire", // Отскок
  ab6: "earth", // Разделение
  ab7: "water", // Проникновение
  ab8: "none", // Смена (нет урона)
  ab0: "clear", // Удар (базовый)
};

// Цвета стихий для обводки
const ELEMENT_COLOR: Record<
  "earth" | "fire" | "water" | "cosmos" | "none" | "clear",
  string
> = {
  earth: "#129447",
  fire: "#E53935",
  water: "#1E88E5",
  cosmos: "#8E24AA",
  none: "#BDBDBD",
  clear: "#000",
};

type AbilityDef = {
  id: AbilityId;
  title: string;
  hint: string;
  glyph: (
    p: p5,
    cx: number,
    cy: number,
    r: number,
    enabled: boolean,
    weaponImg?: p5.Image,
    weaponImgBig?: p5.Image
  ) => void;
};

// описание суперударов + кнопка удара
const ABILITIES: Record<AbilityId, AbilityDef> = {
  ab5: {
    id: "ab5",
    title: "Отскок",
    hint: "Огонь: цель + ещё одна",
    glyph: (p, cx, cy, r, en) => {
      p.noFill();
      p.stroke(en ? [229, 57, 53] : [160]);
      p.strokeWeight(3);
      p.arc(
        cx - r * 0.2,
        cy + r * 0.1,
        r * 1.1,
        r * 1.1,
        -Math.PI * 0.2,
        Math.PI * 0.4
      );
      p.line(cx + r * 0.35, cy - r * 0.15, cx + r * 0.55, cy - r * 0.35);
      p.line(cx + r * 0.35, cy - r * 0.15, cx + r * 0.6, cy - r * 0.1);
      p.noStroke();
    },
  },
  ab6: {
    id: "ab6",
    title: "Разделение",
    hint: "Земля: цель + сосед на линии",
    glyph: (p, cx, cy, r, en) => {
      p.stroke(en ? [26, 148, 71] : [160]);
      p.strokeWeight(3);
      p.line(cx - r * 0.45, cy, cx + r * 0.1, cy);
      p.line(cx + r * 0.1, cy, cx + r * 0.45, cy - r * 0.25);
      p.line(cx + r * 0.1, cy, cx + r * 0.45, cy + r * 0.25);
      p.noStroke();
    },
  },
  ab7: {
    id: "ab7",
    title: "Проникновение",
    hint: "Вода: цель + след. позиция",
    glyph: (p, cx, cy, r, en) => {
      p.stroke(en ? [30, 136, 229] : [160]);
      p.strokeWeight(3);
      p.line(cx - r * 0.5, cy, cx + r * 0.2, cy);
      p.line(cx + r * 0.2, cy, cx + r * 0.05, cy - r * 0.18);
      p.line(cx + r * 0.2, cy, cx + r * 0.05, cy + r * 0.18);
      p.stroke(en ? 140 : 190);
      p.line(cx - r * 0.05, cy - r * 0.25, cx - r * 0.05, cy + r * 0.25);
      p.noStroke();
    },
  },
  ab8: {
    id: "ab8",
    title: "Смена",
    hint: "Смена стихии цели (урон 0, −2 хода)",
    glyph: (p, cx, cy, r, en) => {
      p.noFill();
      p.stroke(en ? 80 : 170);
      p.strokeWeight(3);
      p.arc(cx, cy, r * 1.1, r * 1.1, Math.PI * 0.15, Math.PI * 1.2);
      p.line(cx + r * 0.45, cy - r * 0.15, cx + r * 0.6, cy - r * 0.32);
      p.line(cx + r * 0.45, cy - r * 0.15, cx + r * 0.67, cy - r * 0.05);
      p.noStroke();
    },
  },
  ab0: {
    id: "ab0",
    title: "Удар",
    hint: "Простой удар оружием",
    // теперь glyph принимает обе картинки: weaponImgSmall, weaponImgBig
    glyph: (
      p,
      cx,
      cy,
      r,
      en,
      weaponImgSmall?: p5.Image,
      weaponImgBig?: p5.Image
    ) => {
      const W = Math.max(48, Math.round(r * 2.8)); // ширина панели
      const H = Math.max(128, Math.round(r)); // высота панели
      const x = Math.round(cx - W / 2);
      const y = Math.round(cy - H / 1.5 ) - 20;

      const el = (
        typeof getActiveElementFromPointAbility === "function"
          ? getActiveElementFromPointAbility()
          : "earth"
      ) as any;

      // ПРИОРИТЕТ: weaponImgBig (если есть) → weaponImgSmall → undefined
      const imgToDraw = weaponImgBig ?? weaponImgSmall ?? undefined;

      drawAb0Adv(p, x, y, {
        img: imgToDraw,
        element: el,
        w: W,
        h: H,
        animate: true,
        label: undefined,
      });
    },
  },
};

// доступность суперударов по типу оружия (ab0 всегда доступен)
const RULE_SUPERS: Record<WeaponRule, AbilityId[]> = {
  t1: ["ab0", "ab6", "ab8"],
  t2: ["ab0", "ab7", "ab8"],
  t3: ["ab0", "ab5", "ab8"],
};

// состояние
let selectedSuper: AbilityId | null = null;
type Hit = { x: number; y: number; r: number; id: AbilityId; enabled: boolean };
let hits: Hit[] = [];

export function drawAbilityPanel(
  p: p5,
  x: number,
  y: number,
  w: number,
  data: {
    rule: WeaponRule;
    selected?: AbilityId | null;
    weaponImg?: p5.Image; // small image переданная напрямую из main
    weaponImgBig?: p5.Image; // big image (опционально)
    selectedIcons?: Record<number, p5.Image>; // map (id -> img) как fallback
    selectedWeaponId?: number;
  }
) {
  const listAll: AbilityId[] = ["ab5", "ab6", "ab0", "ab7", "ab8"];
  const enabledList = new Set(RULE_SUPERS[data.rule] ?? []);
  if (data.selected !== undefined) selectedSuper = data.selected;

  // 🔧 сбросить выбор, если текущая абилка не поддерживается оружием
  if (selectedSuper && !enabledList.has(selectedSuper)) {
    selectedSuper = "ab0"; // ← переключаем на обычный удар
  }

  hits = [];
  const size = 46,
    gap = 16;
  const usable = listAll.length;
  const totalW = usable * size + (usable - 1) * gap;
  const startX = x + Math.floor((w - totalW) / 2);
  const cy = y + size / 2;

  for (let i = 0; i < listAll.length; i++) {
    const id = listAll[i];
    const def = ABILITIES[id];
    const enabled = enabledList.has(id);

    const cx = startX + i * (size + gap);

    p.noStroke();
    p.fill(255);
    p.rect(cx - 2, y - 2, size + 4, size + 4, 10);

    p.fill(enabled ? 248 : 236);
    p.circle(cx + size / 2, cy, size);

    const sel = selectedSuper === id && enabled;
    if (sel) {
      const el = ABILITY_TO_ELEMENT[id];
      p.noFill();
      p.stroke(ELEMENT_COLOR[el]);
      p.strokeWeight(3);
      p.circle(cx + size / 2, cy, size + 6);
    }

    // small: weaponImg (переданная напрямую) или fallback из selectedIcons
    const glyphImgSmall: p5.Image | undefined =
      data.weaponImg ??
      (data.selectedIcons && typeof data.selectedWeaponId === "number"
        ? data.selectedIcons[data.selectedWeaponId]
        : undefined);

    // big: приоритет — weaponImgBig, затем weaponImg, затем тот же fallback
    const glyphImgBig: p5.Image | undefined =
      data.weaponImgBig ?? data.weaponImg ?? glyphImgSmall;

    // Передаём обе картинки (малую и большую) — glyph умеет оба параметра
    def.glyph(
      p,
      cx + size / 2,
      cy,
      size * 0.42,
      enabled,
      glyphImgSmall,
      glyphImgBig
    );

    p.noStroke();
    p.fill(enabled ? 20 : 140);
    p.textAlign(p.CENTER, p.TOP);
    p.textSize(11);
    p.text(def.title, cx + size / 2, y + size + 6);

    hits.push({ x: cx + size / 2, y: cy, r: size / 2, id, enabled });
  }
}

export function handleAbilityClick(mx: number, my: number): AbilityId | null {
  for (const h of hits) {
    const d = Math.hypot(mx - h.x, my - h.y);
    if (d <= h.r) {
      if (!h.enabled) return null; // клик по потушенной — игнор
      if (h.id === "ab0") {
        selectedSuper = "ab0";
        return "ab0";
      }
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

// Если нужно снаружи быстро проверить доступность:
export function isSuperAbilityEnabled(rule: WeaponRule, id: AbilityId) {
  return (RULE_SUPERS[rule] ?? []).includes(id);
}
