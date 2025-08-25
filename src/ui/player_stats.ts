import p5 from "p5";

export function drawPlayerStats(
  p: p5,
  x: number,
  y: number,
  w: number,
  hitsLeft: number,
  maxHits: number,
  hp: number,
  hpMax: number,
  attackMin: number,
  attackMax: number,
  defense: number,
  luck: number
) {
  const fullH = 40; // общая высота панели с отступом
  const barH = 18;

  const ratio = Math.max(0, Math.min(1, hitsLeft / maxHits));

  // 🔹 Вычислим укороченную полоску ударов (70% ширины)
  const barW = Math.floor(w * 0.7);
  const barX = x + Math.floor((w - barW) / 2);
  const barY = y;

  // фон полоски
  p.noStroke();
  p.fill("#ffee88");
  p.rect(barX, barY, barW, barH, 4);

  // заполнение
  const filledWidth = Math.floor(ratio * barW);
  p.fill("#ffcc00");
  p.rect(barX, barY, filledWidth, barH, 4);

  // чёрный текст поверх полоски
  p.fill(0);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(12);
  p.text(`${hitsLeft}/${maxHits}`, barX + barW / 2, barY + barH / 2);

  // === Заголовок ===
  p.textAlign(p.CENTER, p.BOTTOM);
  p.textSize(14);
  p.text("КОЛИЧЕСТВО УДАРОВ", barX + barW / 2, barY - 4);

  // === Характеристики игрока ===
  const statsBoxWidth = 160;
  const statsBoxHeight = 80;
  const statsX = x + Math.floor((w - statsBoxWidth) / 2);
  const statsY = y + barH + 12;

  p.fill(255);
  p.stroke(0);
  p.strokeWeight(1);
  p.rect(statsX, statsY, statsBoxWidth, statsBoxHeight);

  p.fill(0);
  p.noStroke();
  p.textSize(12);
  p.textAlign(p.LEFT, p.CENTER);

  const lineH = 18;
  const lineX = statsX + 10;
  let lineY = statsY + 14;

  p.text(`АТАКА`, lineX, lineY);
  p.textAlign(p.RIGHT, p.CENTER);
  p.text(`${attackMin}–${attackMax}`, statsX + statsBoxWidth - 10, lineY);

  p.textAlign(p.LEFT, p.CENTER);
  lineY += lineH;
  p.text(`ЗАЩИТА`, lineX, lineY);
  p.textAlign(p.RIGHT, p.CENTER);
  p.text(`${defense}`, statsX + statsBoxWidth - 10, lineY);

  p.textAlign(p.LEFT, p.CENTER);
  lineY += lineH;
  p.text(`ЗДОРОВЬЕ`, lineX, lineY);
  p.textAlign(p.RIGHT, p.CENTER);
  p.fill(0);
  p.text(`${hp}`, statsX + statsBoxWidth - 40, lineY);
  p.fill(150);
  p.text(` / ${hpMax}`, statsX + statsBoxWidth - 10, lineY);

  p.textAlign(p.LEFT, p.CENTER);
  lineY += lineH;
  p.fill(0);
  p.text(`УДАЧА`, lineX, lineY);
  p.textAlign(p.RIGHT, p.CENTER);
  p.text(`${luck}`, statsX + statsBoxWidth - 10, lineY);
}
