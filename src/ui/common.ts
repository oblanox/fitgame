import p5 from "p5";

export function drawPanelBg(
  p: p5,
  x: number,
  y: number,
  w: number,
  fullH: number,
  bgColor: string = "#f9edd6"
) {
  // 🔹 Фоновая панель — на всю ширину
  p.noStroke();
  p.fill(bgColor);
  p.rect(x, y - 8, w, fullH, 0);
}


