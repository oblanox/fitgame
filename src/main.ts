import p5 from "p5";

/* ===== Стихии (ровно 4 цвета) ===== */
type ElementKey = "green" | "fire" | "cold" | "cosmos";
const ELEMENT_COLOR: Record<ElementKey, string> = {
  green:  "#129447", // зелёный
  fire:   "#E53935", // красный
  cold:   "#1E88E5", // синий
  cosmos: "#8E24AA", // фиолетовый (магента)
};
function toElementKey(s: string): ElementKey {
  const k = (s ?? "").toLowerCase();
  return (["green","fire","cold","cosmos"] as const).includes(k as any) ? (k as ElementKey) : "green";
}

/* ===== Мини-тип конфигурации, только то, что используем ===== */
type FieldCfg = {
  bg?: string; line?: string; rows?: number; widthRatio?: number;
  padding?: { left: number; right: number; top: number; bottom: number };
};
type BossCfg = { type:number; element:string; hp:number; atk:number; row?:number; col?:number; radius?:number };
type MinionCfg = { id:number; type:number; element:string; hp:number; atk:number; row?:number; col?:number; radius?:number };
type Cfg = {
  field?: FieldCfg;
  player: { hpMax:number; hp:number; hits:number };
  boss: BossCfg;
  minions: MinionCfg[];
};

/* ===== Глобальное состояние ===== */
let cfg: Cfg | null = null;

let abilityIdx = 1;
let weaponIdx  = 1;
let playerHp   = 0;
let hitsLeft   = 0;

/* ===== Противники для рендера ===== */
type Enemy = {
  id: number;
  kind: "minion" | "boss";
  element: ElementKey;
  hp: number; atk: number;
  row: number; col: number;  // row: 1..rows (низ=1), col: 0..1 (в ширину поля)
  x: number; y: number; r: number;
};
let enemies: Enemy[] = [];

/* ===== Загрузка/инициализация ===== */
async function loadConfig(url = "/config.json") {
  try {
    const r = await fetch(url, { cache: "no-store" });
    cfg = await r.json();
  } catch (e) {
    console.error("config load failed", e);
    cfg = {
      field: { bg:"#F9EDD6", line:"#B0846A", rows:5, widthRatio:0.70, padding:{left:80,right:40,top:40,bottom:120} },
      player: { hpMax:2200, hp:2200, hits:60 },
      boss: { type:1, element:"green", hp:88, atk:28, row:4, col:0.5, radius:62 },
      minions: []
    };
  }
  resetSession();
}

function resetSession() {
  if (!cfg) return;
  playerHp = cfg.player.hp;
  hitsLeft = cfg.player.hits;

  enemies = [];

  // Миньоны
  for (const m of cfg.minions) {
    enemies.push({
      id: m.id,
      kind: "minion",
      element: toElementKey(m.element),
      hp: m.hp, atk: m.atk,
      row: m.row ?? 2, col: m.col ?? 0.5,
      x: 0, y: 0, r: m.radius ?? 30,
    });
  }

  // Босс
  enemies.push({
    id: 999,
    kind: "boss",
    element: toElementKey(cfg.boss.element),
    hp: cfg.boss.hp, atk: cfg.boss.atk,
    row: cfg.boss.row ?? 4, col: cfg.boss.col ?? 0.5,
    x: 0, y: 0, r: cfg.boss.radius ?? 60,
  });

  layoutEnemies();
  updateHud();
}

/* ===== Геометрия поля ===== */
function getFieldRect() {
  const W = 960, H = 540; // размер канвы
  const fr = cfg?.field ?? {};
  const pad = fr.padding ?? { left: 80, right: 40, top: 40, bottom: 120 };

  const widthRatio = Math.max(0.3, Math.min(1, fr.widthRatio ?? 0.70)); // 30%..100%
  const fieldW = Math.floor(W * widthRatio);          // поле УЗКОЕ по ширине
  const fieldH = H - pad.top - pad.bottom;            // высота растёт
  const fieldX = Math.floor((W - fieldW) / 2);        // по центру
  const fieldY = pad.top;

  return { fieldX, fieldY, fieldW, fieldH };
}

function layoutEnemies() {
  if (!cfg) return;
  const { fieldX, fieldY, fieldW, fieldH } = getFieldRect();
  const rows = Math.max(2, cfg.field?.rows ?? 5);

  const stepY = fieldH / (rows - 1);
  const yAt = (row: number) => fieldY + fieldH - (row - 1) * stepY; // низ=1
  const xAt = (col: number)  => fieldX + Math.max(0, Math.min(1, col)) * fieldW;

  for (const e of enemies) {
    e.x = xAt(e.col);
    e.y = yAt(Math.max(1, Math.min(rows, e.row)));
  }
}

function updateHud() {
  if (!cfg) return;
  const hpEl = document.getElementById("hp");
  if (hpEl) hpEl.textContent = `HP: ${playerHp}/${cfg.player.hpMax} | Ходы: ${hitsLeft}`;
  const ab = document.getElementById("ability"); if (ab) ab.textContent = `Абилка: ${abilityIdx}`;
  const we = document.getElementById("weapon");  if (we) we.textContent  = `Оружие: ${weaponIdx}`;
}

/* ===== Сцена p5 ===== */
const sketch = (s: p5) => {
  const W = 960, H = 540;
  let t = 0;
  let hoveredId: number | null = null;

  s.setup = () => {
    const c = s.createCanvas(W, H);
    c.parent("canvas-wrap");
    s.frameRate(60);
  };

  s.draw = () => {
    s.background(24);

    if (!cfg) {
      s.fill(200); s.textAlign(s.CENTER, s.CENTER); s.text("loading…", W/2, H/2);
      return;
    }

    const { fieldX, fieldY, fieldW, fieldH } = getFieldRect();
    const rows = Math.max(2, cfg.field?.rows ?? 5);
    const bg   = cfg.field?.bg   ?? "#F9EDD6";
    const line = cfg.field?.line ?? "#B0846A";

    // фон поля
    s.noStroke(); s.fill(bg);
    s.rect(fieldX, fieldY, fieldW, fieldH, 10);

    // горизонтальные линии + цифры слева (1..rows)
    s.stroke(line); s.strokeWeight(3);
    s.textAlign(s.RIGHT, s.CENTER); s.fill(line);
    const stepY = fieldH / (rows - 1);
    for (let r = 1; r <= rows; r++) {
      const y = fieldY + fieldH - (r - 1) * stepY;
      s.line(fieldX, y, fieldX + fieldW, y);
      s.textSize(18);
      s.text(String(r), fieldX - 8, y);
    }

    // круги (без цифр внутри)
    s.noStroke();
    for (const e of enemies) {
      s.fill(ELEMENT_COLOR[e.element]);
      s.circle(e.x, e.y, e.r * 2);

      if (hoveredId === e.id) {
        s.noFill(); s.stroke(255); s.strokeWeight(3);
        s.circle(e.x, e.y, e.r * 2 + 6);
        s.noStroke();
      }
    }

    // полоса HP игрока (как прежде)
    s.noFill(); s.stroke("#ff9900"); s.strokeWeight(6);
    const hpPct = Math.max(0, Math.min(1, playerHp / cfg.player.hpMax));
    s.line(40, H-40, 40 + hpPct*(W-80), H-40);

    // «оружие» у игрока — просто шевелится (демо)
    s.noStroke(); s.fill("#ddd");
    const ox = 40 + Math.sin(t)*6, oy = H-80 + Math.cos(t*0.7)*4;
    s.rect(ox, oy, 24, 8, 4);
    t += 0.08;
  };

  s.mouseMoved = () => {
    hoveredId = null;
    for (const e of enemies) {
      const d = Math.hypot(s.mouseX - e.x, s.mouseY - e.y);
      if (d <= e.r) { hoveredId = e.id; break; }
    }
  };

  s.mousePressed = () => {
    if (!hoveredId) return;
    // логика удара добавим позже
  };
};

/* ===== Загрузка + запуск ===== */
(async () => {
  await loadConfig();
  new p5(sketch);

  // UI: рестарт/загрузка файла
  const restartBtn = document.getElementById("restart");
  restartBtn?.addEventListener("click", () => resetSession());

  const fileInput = document.getElementById("file") as HTMLInputElement | null;
  fileInput?.addEventListener("change", (ev) => {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    input.files[0].text().then(txt => { cfg = JSON.parse(txt); resetSession(); });
  });
})();
