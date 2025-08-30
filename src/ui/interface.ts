// interface.ts
import p5 from "p5";

export type HpBarStyle = {
  height: number;
  corner: number; // теперь игнорируется (оставлен для совместимости)
  fillFull: string;
  fillEmpty: string;
  strokeA: number;
  textA: number;
  textSize: number;
  padH: number;
  offsetY: number;
};

const defaultHpBarStyle: HpBarStyle = {
  height: 32,
  corner: 0, // без скруглений
  fillFull: "#F7935A",
  fillEmpty: "#E6CFC2",
  strokeA: 160,
  textA: 210,
  textSize: 16,
  padH: 32,
  offsetY: 18,
};

// Прямоугольник без скруглений (единый хелпер)
function rr(p: p5, x: number, y: number, w: number, h: number) {
  p.rect(x, y, w, h);
}

// --- ПОСТАВЬ ЭТИ ФУНКЦИИ В interface.ts ---

// вернуть прямоугольник поля (как было)
function fieldRect() {
  return (window as any).__fieldRect as {
    fieldX: number;
    fieldY: number;
    fieldW: number;
    fieldH: number;
  };
}

// НОВОЕ: прямоугольник панели той же ширины, сразу под полем
function panelRect(p: p5) {
  const fr = fieldRect();
  if (!fr) return null;
  const x = fr.fieldX;
  const y = fr.fieldY + fr.fieldH; // сразу под экраном врагов
  const w = fr.fieldW; // ширина = как у поля
  const h = p.height - y; // до низа канваса
  const pr = { x, y, w, h };
  (window as any).__panelRect = pr; // можно использовать в mousePressed
  return pr;
}

/** HP‑бар без скруглений; только визуал */
export function drawPlayerHpBar(
  p: p5,
  cfg: any,
  style: Partial<HpBarStyle> = {}
) {
  const st: HpBarStyle = { ...defaultHpBarStyle, ...style };
  const rect = fieldRect();
  const pr = panelRect(p);
  if (pr) {
    p.noStroke();
    p.fill(cfg.field?.bg ?? "#F9EDD6");
    p.rect(pr.x, pr.y, pr.w, pr.h); // ← раньше было (0, panelTop, p.width, ...)
  }
  if (!rect || !cfg?.player) return;

  const hpMax = Math.max(1, Number(cfg.player.hpMax ?? 0));
  const hp = Math.max(0, Math.min(hpMax, Number(cfg.player.hp ?? 0)));

  const bw = Math.max(60, rect.fieldW - st.padH * 2);
  const bx = rect.fieldX + st.padH;
  const by = rect.fieldY + rect.fieldH + st.offsetY;
  const bh = st.height;

  const filledW = Math.round(bw * (hp / hpMax));

  // пустая подложка
  p.noStroke();
  p.fill(st.fillEmpty);
  rr(p, bx, by, bw, bh);

  // заполнение
  p.fill(st.fillFull);
  rr(p, bx, by, filledW, bh);

  // контур (полупрозрачный белый)
  p.noFill();
  p.stroke(255, 255, 255, st.strokeA);
  p.strokeWeight(2);
  rr(p, bx, by, bw, bh);

  // текст
  p.noStroke();
  p.fill(255, 255, 255, st.textA);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(st.textSize);
  p.text(`${hp} / ${hpMax}`, bx + bw / 2, by + bh / 2 + 1);
}

/** Квадрат‑иконка абилки (рамка без скруглений) */
function abilitySquare(
  p: p5,
  x: number,
  y: number,
  size: number,
  colorHex: string,
  label: string,
  selected = false
) {
  // рамка
  p.noFill();
  p.stroke(255);
  p.strokeWeight(selected ? 4 : 2);
  rr(p, x, y, size, size);

  // диагональный «меч»
  p.stroke(colorHex);
  p.strokeWeight(3);
  p.line(x + size * 0.25, y + size * 0.7, x + size * 0.75, y + size * 0.3);

  // подпись
  p.noStroke();
  p.fill("#1d1d1d");
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(12);
  p.text(label, x + size / 2, y + size + 6);
}

/** Нижняя панель: фон = field.bg, HP‑бар, 4 абилки, оружие, «кол-во ударов», статы */
export function drawPlayerPanel(p: p5, cfg: any) {
  const rect = fieldRect();
  if (!rect || !cfg?.player) return;

  // === ФОН ПАНЕЛИ: продолжаем фон поля вниз ===
  const pr = panelRect(p);
  if (pr) {
    p.noStroke();
    p.fill(cfg.field?.bg ?? "#F9EDD6");
    p.rect(pr.x, pr.y, pr.w, pr.h); // ← вместо (0, panelTop, p.width, …)
  }

  // === HP‑бар ===
  drawPlayerHpBar(p, cfg);

  // === Ряд абилок (4) ===
  const baseY =
    rect.fieldY +
    rect.fieldH +
    defaultHpBarStyle.offsetY +
    defaultHpBarStyle.height +
    18;
  const left = rect.fieldX + 16;
  const gap = 16;
  const size = 46;

  const col = {
    earth: "#2FA461",
    fire: "#F24E3E",
    water: "#2B7FCC",
    cosmos: "#8D34D6",
  };
  const el = cfg.player.elements ?? { earth: 0, fire: 0, water: 0, cosmos: 0 };

  (
    [
      ["earth", `${Math.round(el.earth * 100)}%`, col.earth],
      ["fire", `${Math.round(el.fire * 100)}%`, col.fire],
      ["water", `${Math.round(el.water * 100)}%`, col.water],
      ["cosmos", `${Math.round(el.cosmos * 100)}%`, col.cosmos],
    ] as const
  ).forEach(([, text, c], i) => {
    const x = left + i * (size + gap);
    abilitySquare(
      p,
      x,
      baseY,
      size,
      c,
      text,
      i === (window as any).__ui?.selectedAbilityIndex
    );
  });

  // === Ряд абилок (доп. 4, плейсхолдеры) ===
  for (let i = 0; i < 4; i++) {
    const x = left + i * (size + gap);
    const y2 = baseY + size + 32;
    abilitySquare(p, x, y2, size, "#8a8a8a", "", false);
  }

  // === Слот «оружие» (рамка без скруглений) ===
  const weaponX = left + 4 * (size + gap) + 22;
  const weaponY = baseY;
  p.noFill();
  p.stroke(255);
  p.strokeWeight(3);
  rr(p, weaponX, weaponY, size, size);

  // простая пиктограмма «меч»
  p.stroke("#1d1d1d");
  p.strokeWeight(3);
  p.line(
    weaponX + size * 0.5,
    weaponY + 6,
    weaponX + size * 0.5,
    weaponY + size - 6
  );
  p.line(
    weaponX + 10,
    weaponY + size - 12,
    weaponX + size - 10,
    weaponY + size - 12
  );

  p.noStroke();
  p.fill("#1d1d1d");
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(18);
  p.text(
    String(cfg.player.weaponId ?? 1),
    weaponX + size / 2,
    weaponY + size + 8
  );

  // === «Количество ударов» (прямоугольники без радиусов) ===
  const hitsMax = Number(cfg.player.hits ?? 0);
  const hitsBarW = rect.fieldW - 32;
  const hitsX = rect.fieldX + 16;
  const hitsY = weaponY + size + 60;

  p.noStroke();
  p.fill("#E2B21B");
  rr(p, hitsX, hitsY, hitsBarW * 0.35, 16);
  p.fill("#D6C6A8");
  rr(p, hitsX + hitsBarW * 0.35, hitsY, hitsBarW * 0.65, 16);

  p.noFill();
  p.stroke("#9b8b76");
  p.strokeWeight(1);
  rr(p, hitsX, hitsY, hitsBarW, 16);

  p.noStroke();
  p.fill("#1d1d1d");
  p.textAlign(p.LEFT, p.BOTTOM);
  p.textSize(18);
  p.text("КОЛИЧЕСТВО УДАРОВ", hitsX, hitsY - 8);

  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(14);
  p.text(
    `${Math.round(hitsMax * 0.35)} / ${hitsMax}`,
    hitsX + hitsBarW / 2,
    hitsY + 8
  );

  // === Табличка статов (рамка без скруглений) ===
  const statsX = hitsX;
  const statsY = hitsY + 40;
  const cellW = 180,
    cellH = 26;

  p.noFill();
  p.stroke("#1d1d1d");
  p.strokeWeight(1);
  p.rect(statsX, statsY, cellW, cellH * 4);

  for (let i = 1; i < 4; i++)
    p.line(statsX, statsY + i * cellH, statsX + cellW, statsY + i * cellH);

  const atk = cfg.player.attack ?? { min: 0, max: 0 };
  const def = cfg.player.def ?? 0;
  const hpStr = `${cfg.player.hp} / ${cfg.player.hpMax}`;
  const luck = cfg.player.luck ?? 0;

  const rows: [string, string][] = [
    ["АТАКА", `${atk.min}-${atk.max}`],
    ["ЗАЩИТА", String(def)],
    ["ЗДОРОВЬЕ", hpStr],
    ["УДАЧА", String(luck)],
  ];

  p.textSize(14);
  p.noStroke();
  p.fill("#1d1d1d");
  rows.forEach(([k, v], i) => {
    const y = statsY + cellH * i + cellH / 2;
    p.textAlign(p.LEFT, p.CENTER);
    p.text(k, statsX + 8, y);
    p.textAlign(p.RIGHT, p.CENTER);
    p.text(v, statsX + cellW - 8, y);
  });
}
