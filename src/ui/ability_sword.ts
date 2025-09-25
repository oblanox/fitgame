import type p5 from "p5";
import { easeOutBack } from "../animations"; // если нет — внизу есть локальная, 
// замена, пока оставим

export type SwordButtonOptions = {
  id?: string | number; // идентификатор кнопки
  x: number;
  y: number;
  w: number;
  h: number;
  damageText?: string; // текст под иконкой (например "10–13")
  primaryColor?: string;
  bgColor?: string;
  textColor?: string;
  onTrigger?: (id?: string | number) => void;
  disabled?: boolean;
  showBorder?: boolean;
};

type AnimState = {
  t0: number;
  ms: number;
  angleFrom: number;
  angleTo: number;
  pxFrom: number;
  pxTo: number;
};

const anims = new Map<string | number, AnimState>();

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// локальный easing 
function easeOutBackLocal(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Запустить анимацию удара (короткий swing) */
export function triggerSwordAnim(id: string | number = "sword", durationMs = 420) {
  const t0 = nowMs();
  // меч будет повернут от -18deg -> +28deg и смещён вперёд немного
  anims.set(id, {
    t0,
    ms: durationMs,
    angleFrom: -Math.PI * 0.09,
    angleTo: Math.PI * 0.16,
    pxFrom: 0,
    pxTo: 10,
  });
}

/** Проверка: запущена ли анимация */
export function isSwordAnimating(id: string | number = "sword") {
  const st = anims.get(id);
  if (!st) return false;
  const k = Math.min(1, (nowMs() - st.t0) / st.ms);
  return k < 1;
}

/** Обработчик клика: если кликнут в rect, запускает anim и вызывает callback */
export function handleSwordClick(
  mx: number,
  my: number,
  opts: SwordButtonOptions
): boolean {
  const { x, y, w, h, id } = opts;
  if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
    if (opts.disabled) return false;
    triggerSwordAnim(id ?? "sword");
    if (opts.onTrigger) {
      try {
        opts.onTrigger(opts.id);
      } catch {}
    }
    return true;
  }
  return false;
}

/** Главная функция отрисовки кнопки меча.
 *  В draw loop вызывается каждую кадровую.
 */
export function drawSwordButton(s: p5, opts: SwordButtonOptions) {
  const {
    x,
    y,
    w,
    h,
    damageText = "",
    primaryColor = "#FF8C00",
    bgColor = "rgba(255,255,255,0.04)",
    textColor = "#111",
    disabled = false,
    showBorder = true,
    id = "sword",
  } = opts;

  // compute hover
  const isHover = s.mouseX >= x && s.mouseX <= x + w && s.mouseY >= y && s.mouseY <= y + h;

  s.push();
  s.textAlign(s.CENTER, s.CENTER);

  // background
  s.noStroke();
  s.fill(bgColor);
  s.rect(x, y, w, h, 10);

  if (showBorder) {
    s.stroke(255, 255, 255, isHover ? 200 : 60);
    s.noFill();
    s.strokeWeight(isHover ? 2.2 : 1.0);
    s.rect(x + 0.5, y + 0.5, w - 1, h - 1, 10);
  }

  // disabled overlay
  if (disabled) {
    s.fill(0, 0, 0, 140);
    s.rect(x, y, w, h, 10);
  }


  const cx = x + w / 2;
  const cy = y + h * 0.42; // a bit above center

  // animation state
  const st = anims.get(id);
  let angle = 0;
  let advancePx = 0;
  if (st) {
    const t = nowMs();
    const k = Math.min(1, (t - st.t0) / st.ms);
    const ke = easeOutBackLocal(k);
    angle = st.angleFrom + (st.angleTo - st.angleFrom) * ke;
    advancePx = st.pxFrom + (st.pxTo - st.pxFrom) * ke;
    if (k >= 1) {
      anims.delete(id);
      // small settle: leave angle 0 after finish
      angle = 0;
      advancePx = 0;
    }
  }

  // draw sword 
  s.push();
  s.translate(cx + advancePx, cy);
  s.rotate(angle);

  // blade
  const bladeLen = Math.min(w, h) * 0.46;
  const bladeW = Math.max(6, Math.round(w * 0.06));
  s.noStroke();
  // blade gradient-ish: draw several layered rectangles
  for (let i = 0; i < 6; i++) {
    const alpha = 200 - i * 28;
    s.fill(220 + i * 3, 220 + i * 3, 230 + i * 2, alpha);
    const bw = bladeW - i * 1;
    s.rect(-bw / 2, -bladeLen * 0.02 - i * 0.6, bw, bladeLen + i * 1.5, 2);
  }

  // tip (triangle)
  s.fill(240, 240, 250, 220);
  s.triangle(-bladeW / 2, -bladeLen * 0.02 - 1, bladeW / 2, -bladeLen * 0.02 - 1, 0, -bladeLen - 2);

  // hilt
  s.fill(primaryColor);
  const hiltW = bladeW * 2.2;
  const hiltH = Math.max(8, Math.round(h * 0.06));
  s.rect(-hiltW / 2, bladeLen * 0.45, hiltW, hiltH, 4);

  // pommel
  s.fill(200);
  s.circle(0, bladeLen * 0.45 + hiltH / 2 + 6, Math.max(6, Math.round(w * 0.03)));

  s.pop();

  // damage text under the icon
  s.push();
  const txtY = y + h * 0.78;
  s.textAlign(s.CENTER, s.CENTER);
  s.fill(disabled ? "rgba(200,200,200,0.5)" : textColor);
  s.noStroke();
  s.textSize(Math.max(10, Math.round(h * 0.12)));
  s.text(damageText, cx, txtY);
  s.pop();

  // hover hint circle small
  if (isHover && !disabled) {
    s.push();
    s.noFill();
    s.stroke(primaryColor);
    s.strokeWeight(1.2);
    s.circle(x + w - 20, y + 20, 12);
    s.pop();
  }

  s.pop();
}
