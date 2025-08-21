import p5 from "p5";
// interface.ts
export type HpBarStyle = {
  height: number;
  corner: number;
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
  corner: 0,
  fillFull: "#F7935A",
  fillEmpty: "#E6CFC2",
  strokeA: 160,
  textA: 210,
  textSize: 16,
  padH: 32,
  offsetY: 18,
};

function rr(p: p5, x: number, y: number, w: number, h: number, r: number) {
  p.rect(x, y, w, h, r, r, r, r);
}
function fieldRect() {
  return (window as any).__fieldRect as {
    fieldX: number;
    fieldY: number;
    fieldW: number;
    fieldH: number;
  };
}

/** Рисует HP‑бар как на макете */
export function drawPlayerHpBar(
  p: p5,
  cfg: any,
  style: Partial<HpBarStyle> = {}
) {
  const st: HpBarStyle = { ...defaultHpBarStyle, ...style };
  const rect = fieldRect();
  if (!rect || !cfg?.player) return;

  const hpMax = Math.max(1, Number(cfg.player.hpMax ?? 0));
  const hp = Math.max(0, Math.min(hpMax, Number(cfg.player.hp ?? 0)));
  const bw = Math.max(60, rect.fieldW - st.padH * 2);
  const bx = rect.fieldX + st.padH;
  const by = rect.fieldY + rect.fieldH + st.offsetY;
  const bh = st.height;

  const filledW = Math.round(bw * (hp / hpMax));

  p.noStroke();
  p.fill(st.fillEmpty);
  rr(p, bx, by, bw, bh, st.corner);
  p.fill(st.fillFull);
  rr(p, bx, by, filledW, bh, st.corner);
  p.noFill();
  p.stroke(255, 255, 255, st.strokeA);
  p.strokeWeight(2);
  rr(p, bx, by, bw, bh, st.corner);
  p.noStroke();
  p.fill(255, 255, 255, st.textA);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(st.textSize);
  p.text(`${hp} / ${hpMax}`, bx + bw / 2, by + bh / 2 + 1);
}

/** Маленький квадрат‑иконка абилки с подписью процента */
function abilitySquare(
  p: p5,
  x: number,
  y: number,
  size: number,
  colorHex: string,
  label: string,
  selected = false
) {
  p.noFill();
  p.stroke(255);
  p.strokeWeight(selected ? 4 : 2);
  rr(p, x, y, size, size, 8);
  // диагональный «меч»
  p.stroke(colorHex);
  p.strokeWeight(3);
  p.line(x + size * 0.25, y + size * 0.7, x + size * 0.75, y + size * 0.3);
  // подпись процента
  p.noStroke();
  p.fill("#1d1d1d");
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(12);
  p.text(label, x + size / 2, y + size + 6);
}

/** Низ панели со статами, абилками и оружием */
export function drawPlayerPanel(p: p5, cfg: any) {
  const rect = fieldRect();
  if (!rect || !cfg?.player) return;

  // 1) HP‑бар
  drawPlayerHpBar(p, cfg);

  // 2) Абилки (4 стандартные + 4 доп. слева направо)
  const baseY =
    rect.fieldY +
    rect.fieldH +
    defaultHpBarStyle.offsetY +
    defaultHpBarStyle.height +
    18;
  const left = rect.fieldX + 16;
  const gap = 16;
  const size = 46;

  // цвета по стихиям
  const col = {
    earth: "#2FA461",
    fire: "#F24E3E",
    water: "#2B7FCC",
    cosmos: "#8D34D6",
  };
  const el = cfg.player.elements ?? { earth: 0, fire: 0, water: 0, cosmos: 0 };
  const labels = [
    ["earth", `${Math.round(el.earth * 100)}%`, col.earth],
    ["fire", `${Math.round(el.fire * 100)}%`, col.fire],
    ["water", `${Math.round(el.water * 100)}%`, col.water],
    ["cosmos", `${Math.round(el.cosmos * 100)}%`, col.cosmos],
  ] as const;

  // ряд 1: четыре стандартные
  labels.forEach(([, text, c], i) => {
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

  // ряд 2: четыре доп. (плейсхолдеры в сером)
  for (let i = 0; i < 4; i++) {
    const x = left + i * (size + gap);
    const y2 = baseY + size + 32;
    abilitySquare(p, x, y2, size, "#8a8a8a", "", false);
  }

  // 3) Блок «оружие» (иконка и номер)
  const weaponX = left + 4 * (size + gap) + 22;
  const weaponY = baseY;
  p.noFill();
  p.stroke(255);
  p.strokeWeight(3);
  rr(p, weaponX, weaponY, size, size, 8);
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

  // 4) Полоса «Количество ударов» (плейсхолдер)
  const hitsMax = Number(cfg.player.hits ?? 0);
  const hitsBarW = rect.fieldW - 32;
  const hitsX = rect.fieldX + 16;
  const hitsY = weaponY + size + 60;
  p.noStroke();
  p.fill("#E2B21B");
  rr(p, hitsX, hitsY, hitsBarW * 0.35, 16, 4); // заполнение 35% условно
  p.fill("#D6C6A8");
  rr(p, hitsX + hitsBarW * 0.35, hitsY, hitsBarW * 0.65, 16, 4);
  p.noFill();
  p.stroke("#9b8b76");
  p.strokeWeight(1);
  rr(p, hitsX, hitsY, hitsBarW, 16, 4);
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

  // 5) Табличка статов
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
  // заголовки и значения
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
