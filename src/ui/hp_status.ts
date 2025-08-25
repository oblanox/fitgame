// hp_status.ts
import p5 from "p5";

export type PlayerHp = {
  hp: number;
  hpMax: number;
};

/**
 * Панель HP игрока:
 * - Фон рисуется на всю ширину `w`
 * - Полоска HP занимает 70% от `w`, центрирована
 */
export function drawHpStatus(
  p: p5,
  x: number,
  y: number,
  w: number,
  stats: PlayerHp,
  bgColor: string = "#f9edd6"
) {
  const fullH = 40; // общая высота панели с отступом
  const barH = 28;

  const ratio = Math.max(0, Math.min(1, stats.hp / stats.hpMax));

  // 🔹 Вычислим укороченную полоску HP (70% ширины)
  const barW = Math.floor(w * 0.7);
  const barX = x + 12; // + Math.floor((w - barW) / 2);
  const barY = y;

  // 🔹 Светлая основа полосы
  p.fill("#e8d6cb");
  p.rect(barX, barY, barW, barH, 4);

  // 🔹 Заполненная часть (оранжевая)
  p.fill("#f1751a");
  p.rect(barX, barY, barW * ratio, barH, 4);

  // 🔹 Рамка
  p.noFill();
  p.stroke(120);
  p.strokeWeight(1);
  p.rect(barX, barY, barW, barH, 4);

  // 🔹 Текст HP
  p.noStroke();
  p.fill(20);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(16);
  p.text(`${stats.hp}/${stats.hpMax}`, barX + barW / 2, barY + barH / 2);
}
