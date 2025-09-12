import p5 from "p5";
import { drawHpStatus } from "./ui/hp_status";
import { createCounter } from "./counter";
import {
  drawWeaponPanel,
  handleWeaponClick,
  getSelectedWeapon,
  getWeaponIcon,
  preloadWeaponIcons,
  getWeapons,
} from "./ui/weapons";
import {
  drawPointAbilityPanel,
  handlePointAbilityClick,
  getActiveElementFromPointAbility,
  setSelectedPointAbility,
} from "./ui/elements";
import { drawPanelBg } from "@ui/common";
import { drawPlayerStats } from "./ui/player_stats";
import { drawElementSchema, preloadElementSchema } from "@ui/element_schemes";
import {
  drawAbilityPanel,
  handleAbilityClick,
  setSelectedAbility,
  getSelectedAbility,
  isSuperAbilityEnabled,
} from "./ui/abilities";
import { initGameLogger } from "./ui/log_panel";

import {
  setHpBarY,
  drawHpImpactOverlay,
  getEnemyYOffset,
  queueEnemyRetaliationToHp,
} from "./animations";

import {
  computeSingleHit,
  applyDamage,
  DEFAULT_ELEMENT_MATRIX,
  addTag,
  removeTag,
  hasTag,
} from "./combat";
import {
  layoutEnemies as layoutEnemiesModule,
  getFieldRect,
  getRowYs,
} from "./layout";

import { orchestrateAtomicDeaths } from "./death";
import {
  Cfg,
  Enemy,
  ElementKey,
  ElementMatrixCfg,
  PlayerCfg,
  WeaponCfg,
} from "./types";

import {
  preloadAttackIcons,
  drawAttackPre,
  drawAttackRun,
  startAttackAnimation,
  spawnEnemyImpact,
  drawEnemyImpacts,
} from "./ui/attack";

const DEBUG = true;

const ELEMENT_COLOR: Record<ElementKey, string> = {
  earth: "#129447",
  fire: "#E53935",
  water: "#1E88E5",
  cosmos: "#8E24AA",
  none: "#FFFFFF",
};
const ELEMENT_ALIAS: Record<string, ElementKey> = {
  earth: "earth",
  fire: "fire",
  water: "water",
  cosmos: "cosmos",
  green: "earth",
  cold: "water",
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function toElementKey(s: string | undefined): ElementKey {
  const k = (s ?? "").toLowerCase();
  return ELEMENT_ALIAS[k] ?? "earth";
}

let cfg: Cfg | null = null;
let selectedWeaponId = 1;
let hitsLeft = 0;
let playerHp = 0;
let enemies: Enemy[] = [];

const defaultElementMatrix: ElementMatrixCfg = DEFAULT_ELEMENT_MATRIX;

async function loadConfig(url = "/config.json") {
  try {
    const r = await fetch(url, { cache: "no-store" });
    cfg = (await r.json()) as Cfg;
  } catch (e) {
    console.error("config load failed, using fallback", e);
    cfg = {
      field: {
        bg: "#F9EDD6",
        line: "#B0846A",
        rows: 4,
        widthRatio: 0.35,
        padding: { left: 80, right: 40, top: 40, bottom: 120 },
        lineInsetTop: 14,
        lineInsetBottom: 14,
        lineThickness: 3,
      },
      player: {
        hpMax: 2200,
        hp: 2200,
        hits: 60,
        luck: 1,
        def: 1,
        maxHits: 60,
        attack: { min: 1, max: 10 },
        elements: { earth: 0.25, fire: 0.25, water: 0.25, cosmos: 0.25 },
      },
      boss: {
        type: 1,
        element: "earth",
        hp: 88,
        atk: 28,
        row: 4,
        col: 0.5,
        radius: 80,
        lineOffset: 10,
      } as any,
      minions: [],
      weapons: [],
      elementMatrix: defaultElementMatrix,
    };
  }
  normalizeConfig();
  resetSession();
}

function normalizeConfig() {
  if (!cfg) return;
  cfg.boss.element = toElementKey(cfg.boss.element as string);
  cfg.minions = (cfg.minions || []).map((m) => ({
    ...m,
    element: toElementKey(m.element as string),
  }));
  cfg.field = cfg.field ?? {};
  cfg.elementMatrix = cfg.elementMatrix ?? defaultElementMatrix;
}

function resetSession() {
  if (!cfg) return;
  console.warn("[resetSession] called — stack trace:");
  console.trace();
  // защита от рекурсивных/параллельных reset'ов
  if ((window as any).__isResetting) return;
  (window as any).__isResetting = true;

  try {
    // Инициализация базовых значений (playerHp, hitsLeft) до создания таймера
    playerHp = Number(
      (cfg as any)?.player?.hp ?? (cfg as any)?.player?.hpMax ?? 0
    );
    hitsLeft = Number(
      (cfg as any)?.player?.hits ??
        (cfg as any)?.player?.maxHits ??
        (cfg as any)?.timer?.turns ??
        60
    );

    // Параметры таймера из конфига (совместимость: timer.turnMs -> rules.turnMs -> fallback)
    const msPerTurnCfg = Number(
      (cfg as any)?.timer?.turnMs ?? (cfg as any)?.rules?.turnMs ?? 10000
    );
    const decrementOnTurnCfg = Boolean(
      (cfg as any)?.timer?.decrementOnTurn ?? false
    );

    // Остановим / уничтожим старый счётчик, если он есть — чтобы создать новый с актуальным cfg
    try {
      (window as any).__turnCounter?.stop?.();
      (window as any).__turnCounter?.destroy?.();
    } catch (e) {
      // swallow
    }
    (window as any).__turnCounter = undefined;

    // Создаём новый счётчик с колбэками
    (window as any).__turnCounter = createCounter({
      cfg,
      getRemaining: () => hitsLeft,
      setRemaining: (v: number) => {
        hitsLeft = v;
        updateHud();
      },
      msPerTurn: msPerTurnCfg,
      tickIntervalMs: 200,
      decrementOnTurn: decrementOnTurnCfg,
      onTick: (
        remaining: number,
        elapsedInTurn: number,
        elapsedTotal?: number
      ) => {
        const elapsedSafe =
          typeof elapsedTotal === "number" && Number.isFinite(elapsedTotal)
            ? elapsedTotal
            : 0;
        const totalMsLeft = Math.max(0, remaining * msPerTurnCfg - elapsedSafe);

        (window as any).__timerMsLeft = Math.floor(totalMsLeft);
        (window as any).__timerProgress = Math.min(
          1,
          Math.max(0, elapsedInTurn / msPerTurnCfg)
        );
      },
      onTurn: (remaining: number) => {
        // regen: по конфигу timer.regen (не воскресаем мёртвых, не превышаем max)
        const regen = (cfg as any)?.timer?.regen ?? {};
        const minionPct =
          typeof regen.minionPct === "number" &&
          Number.isFinite(regen.minionPct)
            ? regen.minionPct
            : 0;
        const bossPct =
          typeof regen.bossPct === "number" && Number.isFinite(regen.bossPct)
            ? regen.bossPct
            : 0;

        let changed = false;
        if ((minionPct > 0 || bossPct > 0) && Array.isArray(enemies)) {
          for (const e of enemies) {
            if (!e || typeof e.hp !== "number" || e.hp <= 0) continue; // не воскрешаем
            const maxFromCfg =
              e.kind === "boss"
                ? (cfg as any)?.boss?.hp
                : ((cfg as any)?.minions || []).find((m: any) => m.id === e.id)
                    ?.hp;
            const maxHp = Number((e as any).__maxHp ?? maxFromCfg ?? e.hp);
            const pct = e.kind === "boss" ? bossPct : minionPct;
            if (pct > 0 && maxHp > 0) {
              const add = Math.ceil(maxHp * pct);
              const newHp = Math.min(maxHp, (e.hp ?? 0) + add);
              if (newHp !== e.hp) {
                e.hp = newHp;
                changed = true;
              }
            }
          }
          if (changed) updateHud();
        }
      },
      onZero: () => {
        // по ТЗ: при нуле (время или ходы) — перезапустить сессию
        // безопасно, т.к. флаг __isResetting не позволит рекурсивный вход
        try {
          resetSession();
        } catch (err) {
          console.error("[TIMER:onZero] resetSession failed:", err);
        }
      },
      autoStart: false, // стартнем после установки hitsLeft через reset()
    });

    // Сбросим и запустим таймер с текущим hitsLeft
    try {
      (window as any).__turnCounter?.reset?.(hitsLeft);
      (window as any).__turnCounter?.start?.();
    } catch (e) {
      console.warn("[resetSession] turnCounter reset/start failed", e);
    }

    // Построим список врагов (миньоны + босс)
    enemies = [];

    for (const m of cfg.minions || []) {
      enemies.push({
        id: m.id,
        kind: "minion",
        type: m.type,
        element: toElementKey(m.element as any),
        hp: m.hp,
        atk: m.atk,
        row: m.row ?? 2,
        col: m.col ?? 0.5,
        x: 0,
        y: 0,
        r: m.radius ?? 30,
        lineOffset: m.lineOffset ?? 0,
      });
    }

    // Добавим босса
    enemies.push({
      id: 999,
      kind: "boss",
      type: (cfg.boss as any).type,
      element: toElementKey(cfg.boss.element as any),
      hp: cfg.boss.hp,
      atk: cfg.boss.atk,
      row: cfg.boss.row ?? 4,
      col: cfg.boss.col ?? 0.5,
      x: 0,
      y: 0,
      r: cfg.boss.radius ?? 60,
      lineOffset: cfg.boss.lineOffset ?? 0,
    });

    // Сохраняем __maxHp для корректного регена
    for (const e of enemies) {
      if (!(e as any).__maxHp) {
        (e as any).__maxHp =
          e.hp ??
          (e.kind === "boss" ? (cfg as any)?.boss?.hp : undefined) ??
          e.hp;
      }
    }

    // expose for other modules
    (cfg as any).__enemies = enemies;

    // расположение и HUD
    layoutEnemiesModule(cfg, enemies);
    updateHud();
  } finally {
    (window as any).__isResetting = false;
  }
}

function updateHud() {
  if (!cfg) return;
  const hpEl = document.getElementById("hp");
  if (hpEl)
    hpEl.textContent = `HP: ${cfg.player.hp}/${cfg.player.hpMax} | Ходы: ${hitsLeft}`;
  const ab = document.getElementById("ability");
  if (ab) ab.textContent = `Абилка: ${getSelectedAbility() ?? "ab0"}`;
  const we = document.getElementById("weapon");
  if (we) we.textContent = `Оружие: ${selectedWeaponId}`;
}

function drawEnemyBadge(s: p5, e: Enemy, offset = 0) {
  const isBoss = e.kind === "boss";
  const hpSize = isBoss ? 36 : 16;
  const atkSize = isBoss ? 18 : 10;
  const hpDy = isBoss ? -4 : -2;
  const atkDy = isBoss ? 22 : 12;

  s.textAlign(s.CENTER, s.CENTER);
  s.noStroke();
  s.fill(0, 140);
  s.textSize(hpSize);
  s.text(String(e.hp), e.x + 1, e.y + hpDy + 1 + offset);
  s.textSize(atkSize);
  s.text(String(e.atk), e.x + 1, e.y + atkDy + 1 + offset);

  s.stroke(255, 255, 255, 150);
  s.strokeWeight(isBoss ? 1.2 : 1.0);
  s.fill(20);
  s.textSize(hpSize);
  s.text(String(e.hp), e.x, e.y + hpDy + offset);
  s.textSize(atkSize);
  s.text(String(e.atk), e.x, e.y + atkDy + offset);

  // Пометка: если minion type 1 — рисуем красный кружок в углу
  if (e.kind === "minion" && Number(e.type) === 1 && e.hp > 0) {
    const r = e.r || e.radius || 16; // радиус кружка врага
    const rx = e.x + r * 0.68; // смещение вправо (подбирается по вкусу)
    const ry = e.y - r * 0.68 + offset; // смещение вверх (подбирается по вкусу)
    s.push();
    s.noStroke();
    s.fill(255, 24, 24);
    s.circle(rx, ry - 5, Math.max(7, r * 0.2)); // маленький круг
    s.pop();
  }
}

const impactQueues = new Map<number, Promise<void>>();

function enqueueImpact(id: number, fn: () => Promise<void> | void) {
  const prev = impactQueues.get(id) ?? Promise.resolve();
  const next = prev
    .then(() => Promise.resolve().then(() => fn()))
    .catch((err) => {
      console.error("[enqueueImpact] previous error", err);
      return Promise.resolve().then(() => fn());
    });

  impactQueues.set(id, next);

  next.finally(() => {
    if (impactQueues.get(id) === next) impactQueues.delete(id);
  });

  return next;
}

function performHit(
  player: PlayerCfg,
  weapon: WeaponCfg,
  elementMatrix: ElementMatrixCfg | null | undefined,
  target: Enemy,
  ability: "ab0" | "point" | "ab5" | "ab6" | "ab7" | "ab8",
  opts: {
    element?: ElementKey;
    secondCoef?: number;
    ab8Cost?: number;
    cycleOrder?: ElementKey[];
  } = {}
) {
  if (target.hp <= 0) return { type: "skip", reason: "target_dead" };
  const M: ElementMatrixCfg =
    elementMatrix ??
    (cfg?.elementMatrix as ElementMatrixCfg) ??
    defaultElementMatrix;

  if (ability === "ab8") {
    const ORDER = opts.cycleOrder ?? ["earth", "fire", "water", "cosmos"];
    const fromEl = target.element;
    let toEl: ElementKey;
    if (opts.element && opts.element !== "none") toEl = opts.element;
    else {
      const idx = ORDER.indexOf(fromEl);
      const nextIdx = (idx >= 0 ? idx + 1 : 0) % ORDER.length;
      toEl = ORDER[nextIdx] as ElementKey;
    }
    target.element = toEl;
    const cost = opts.ab8Cost ?? 2;
    hitsLeft = Math.max(0, hitsLeft - cost);
    updateHud();
    return { type: "ab8", from: fromEl, to: toEl, cost };
  }

  const singleTargetHit = (el: ElementKey) => {
    const r = computeSingleHit(player, weapon, target, M, el);
    hitsLeft = Math.max(0, hitsLeft - 1);
    return { id: target.id, damage: r.finalDamage, didMiss: !!r.didMiss };
  };

  if (ability === "point") {
    const pointEl = opts.element ?? "none";
    const hitInfo = singleTargetHit(pointEl);
    return { type: "point", total: hitInfo.damage, hits: [hitInfo] };
  }

  if (ability === "ab0") {
    const hitInfo = singleTargetHit("none");
    return { type: "ab0", total: hitInfo.damage, hits: [hitInfo] };
  }

  if (ability === "ab5" || ability === "ab6" || ability === "ab7") {
    const superEl: ElementKey =
      ability === "ab5" ? "fire" : ability === "ab6" ? "earth" : "water";
    const hitsArr: { id: number; damage: number; didMiss: boolean }[] = [];
    const r1 = computeSingleHit(player, weapon, target, M, superEl);
    hitsArr.push({
      id: target.id,
      damage: r1.finalDamage,
      didMiss: !!r1.didMiss,
    });

    let second: Enemy | null = null;
    if (ability === "ab5") {
      const cand = enemies.filter((e) => e.id !== target.id && e.hp > 0);
      cand.sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.y - target.y) -
          Math.hypot(b.x - target.x, b.y - target.y)
      );
      second = cand[0] ?? null;
    } else if (ability === "ab6") {
      const same = enemies.filter(
        (e) => e.id !== target.id && e.hp > 0 && e.row === target.row
      );
      same.sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x));
      second = same[0] ?? null;
    } else {
      const forward = enemies.filter(
        (e) =>
          e.id !== target.id &&
          e.hp > 0 &&
          e.row === target.row &&
          e.x > target.x
      );
      forward.sort((a, b) => a.x - target.x - (b.x - target.x));
      second = forward[0] ?? null;
    }

    if (second) {
      const coefMul = opts.secondCoef ?? 1.0;
      const r2 = computeSingleHit(player, weapon, second, M, superEl, coefMul);
      hitsArr.push({
        id: second.id,
        damage: r2.finalDamage,
        didMiss: !!r2.didMiss,
      });
    }

    hitsLeft = Math.max(0, hitsLeft - 1);
    const total = hitsArr.reduce((s, x) => s + x.damage, 0);
    updateHud();
    return { type: ability, total, count: hitsArr.length, hits: hitsArr };
  }

  return { type: "skip", reason: "unknown_ability" };
}

const selectedIcons: Record<number, p5.Image> = {};

const sketch = (s: p5) => {
  const W = 370,
    H = 1400;
  let hoveredId: number | null = null;

  function preloadWeaponSelected(p: p5) {
    selectedIcons[1] = p.loadImage("assets/icon_weapon_selected_1.png");
    selectedIcons[2] = p.loadImage("assets/icon_weapon_selected_2.png");
    selectedIcons[3] = p.loadImage("assets/icon_weapon_selected_3.png");
  }

  s.setup = () => {
    const c = s.createCanvas(W, H);
    c.parent("canvas-wrap");
    s.frameRate(60);
    preloadWeaponIcons(s);
    preloadAttackIcons(s);
    preloadElementSchema(s);
    initGameLogger({ attachToSelector: "#canvas-wrap" });
  };

  s.draw = () => {
    s.background(24);
    if (!cfg) {
      s.fill(200);
      s.textAlign(s.CENTER, s.CENTER);
      s.text("loading…", W / 2, H / 2);
      return;
    }

    const { fieldX, fieldY, fieldW, fieldH } = getFieldRect(cfg);
    const rows = Math.max(2, cfg.field!.rows ?? 5);
    const rowYs = getRowYs(
      rows,
      { fieldX, fieldY, fieldW, fieldH },
      cfg.field!
    );

    s.noStroke();
    s.fill(cfg.field!.bg!);
    s.rect(fieldX, fieldY, fieldW, fieldH, 0);

    s.stroke(cfg.field!.line!);
    s.strokeWeight(cfg.field!.lineThickness ?? 3);
    s.textAlign(s.RIGHT, s.CENTER);
    s.fill(cfg.field!.line!);

    for (let r = 1; r <= rows; r++) {
      const y = rowYs[r - 1];
      s.line(fieldX, y, fieldX + fieldW, y);
      s.textSize(18);
      s.text(String(r), fieldX - 8, y);
    }
    drawAttackPre(s);
    for (const e of enemies) {
      const ds = Number((e as any).__deadScale ?? 1);
      const da = Number((e as any).__deadAlpha ?? 1);
      s.push();
      s.translate(e.x, e.y + getEnemyYOffset(e));
      s.scale(ds, ds);
      s.noStroke();
      s.fill(ELEMENT_COLOR[e.element]);
      s.drawingContext.globalAlpha = da;
      s.circle(0, 0, e.r * 2);
      s.drawingContext.globalAlpha = 1;
      s.pop();

      if (hoveredId === e.id) {
        s.noFill();
        s.stroke(100);
        s.strokeWeight(3);
        s.circle(e.x, e.y + getEnemyYOffset(e), e.r * 2 + 6);
        s.noStroke();
      }

      drawEnemyBadge(s, e, getEnemyYOffset(e));

      // --- draw boss timer overlay (insert inside the for (const e of enemies) loop) ---
      if (e.kind === "boss") {
        // читает значения, которые мы установили в onTick
        const msLeft = (window as any).__timerMsLeft ?? 0;
        const pct = (window as any).__timerProgress ?? 0;

        // форматирование mm:ss (ceil seconds so it looks nicer)
        function formatMs(ms: number) {
          const secs = Math.max(0, Math.ceil(ms / 1000));
          const mm = Math.floor(secs / 60);
          const ss = secs % 60;
          if (mm > 0) return `${mm} мин ${ss.toString().padStart(2, "0")} сек`;
          return `${ss} сек`;
        }

        // позиционирование: над головой босса
        const yOff = getEnemyYOffset(e); // уже используете эту функцию
        const bubbleX = e.x;
        const bubbleY = e.y - e.r + 40; // подстройте -20 если нужно выше/ниже

        s.push();
        s.translate(bubbleX, bubbleY);

        // timer text
        s.fill(10);
        s.textAlign(s.CENTER, s.CENTER);
        s.textSize(Math.max(10, Math.floor(e.r * 0.18)));
        s.text(formatMs(msLeft), 0, 0);

        // circular progress arc around bubble
        const arcR = Math.max(12, e.r * 0.38);
        const start = -Math.PI / 2;
        const end = start + pct * Math.PI * 2;

        s.noFill();
        s.stroke(0, 130);
        s.strokeWeight(3);

        s.pop();
      }
    }

    let barY = fieldH;
    const weaponY = barY;
    drawPanelBg(s, fieldX, barY, fieldW, 750, cfg.field?.bg);
    drawHpStatus(s, fieldX, barY, fieldW, {
      hp: cfg.player.hp,
      hpMax: cfg.player.hpMax,
    });
    setHpBarY(barY);
    drawSelectedWeaponIcon(s, fieldX, barY);
    drawAttackRun(s);
    drawEnemyImpacts(s);
    drawHpImpactOverlay(s);

    barY += 60;

    drawWeaponPanel(
      s,
      { weapons: getWeapons(cfg), selectedId: getSelectedWeapon()?.id ?? 1 },
      { x: fieldX + 12, y: barY }
    );

    barY += 60;

    const rule = getSelectedWeaponCfg()?.retaliationRule ?? "t1";
    const selectedWeapon = getSelectedWeapon();
    const weaponImg = selectedWeapon
      ? getWeaponIcon(selectedWeapon.kind) ?? undefined
      : undefined;

    drawAbilityPanel(s, fieldX, barY, fieldW, { rule, weaponImg });
    barY += 90;

    drawPointAbilityPanel(s, {
      x: fieldX,
      y: barY,
      w: fieldW,
      playerElements: cfg.player.elements,
      debug: true,
    });
    barY += 80;

    drawPlayerStats(
      s,
      fieldX,
      barY,
      fieldW,
      hitsLeft,
      cfg.player.hits,
      cfg.player.hp,
      cfg.player.hpMax,
      cfg.player.attack.min,
      cfg.player.attack.max,
      cfg.player.def ?? 0,
      cfg.player.luck ?? 0
    );

    barY += 130;

    if (cfg.elementMatrix)
      drawElementSchema(s, fieldX, barY, fieldW, cfg.elementMatrix);
  };

  s.mouseMoved = () => {
    hoveredId = null;
    for (const e of enemies) {
      if (hasTag(e, "attack")) return;
      const d = Math.hypot(s.mouseX - e.x, s.mouseY - e.y);
      if (d <= e.r) {
        hoveredId = e.id;
        break;
      }
    }
  };

  s.mousePressed = () => {
    HandleMouseOrTouch();
  };

  s.touchStarted = () => {
    HandleMouseOrTouch();
  };

  function getInputXY(s: p5) {
    // Если есть touches (на тач-устройстве) — берем первую точку
    if (s.touches && s.touches.length > 0) {
      const touchesObj = s.touches[0] as { x: number; y: number };
      return { x: touchesObj.x, y: touchesObj.y };
    }
    // Иначе — мышь
    return { x: s.mouseX, y: s.mouseY };
  }

  function HandleMouseOrTouch() {
    if (enemies.some((e) => hasTag(e, "attack"))) {
      if (DEBUG)
        console.log(
          "[INPUT] blocked: an enemy is currently tagged with 'attack'"
        );
      return;
    }
    const { x, y } = getInputXY(s);

    hoveredId = null;
    for (const e of enemies) {
      if (hasTag(e, "attack")) return;
      const d = Math.hypot(x - e.x, y - e.y);
      if (d <= e.r) {
        hoveredId = e.id;
        break;
      }
    }

    const pickedWeaponId = handleWeaponClick(s.mouseX, s.mouseY);
    if (pickedWeaponId !== null) {
      selectedWeaponId = pickedWeaponId;
      const rule = getSelectedWeaponCfg()?.retaliationRule ?? "t1";
      const curSuper = getSelectedAbility();

      if (
        curSuper &&
        curSuper !== "ab0" &&
        !isSuperAbilityEnabled(rule as any, curSuper)
      ) {
        setSelectedAbility("ab0");
      }
      return;
    }

    const pickedPoint = handlePointAbilityClick(s.mouseX, s.mouseY);
    if (pickedPoint) {
      setSelectedAbility(null);
      return;
    }

    const pickedSuper = handleAbilityClick(s.mouseX, s.mouseY);
    if (pickedSuper) {
      setSelectedPointAbility("off");
      return;
    }

    if (!hoveredId) return;
    const enemy = enemies.find((e) => e.id === hoveredId);
    if (!enemy || !cfg) return;

    const weapon = getSelectedWeaponCfg() ?? cfg.weapons?.[0] ?? null;
    if (!weapon) return;

    const superId = getSelectedAbility();
    const pointEl = getActiveElementFromPointAbility();
    const elementMatrix = cfg?.elementMatrix || defaultElementMatrix;

    let abilityType: "ab0" | "point" | "ab5" | "ab6" | "ab7" | "ab8";
    let options: any = {};

    if (superId && superId !== "ab0") {
      abilityType = superId as "ab5" | "ab6" | "ab7" | "ab8";
      if (abilityType === "ab8" && pointEl !== "none")
        options.element = pointEl;
    } else if (pointEl !== "none") {
      abilityType = "point";
      options.element = pointEl;
    } else abilityType = "ab0";

    const result = performHit(
      cfg.player,
      weapon,
      elementMatrix,
      enemy,
      abilityType,
      options
    );

    if (
      result &&
      typeof result === "object" &&
      result.type !== "ab8" &&
      result.type !== "skip"
    ) {
      const totalDamage = (result as any).total ?? 0;
      const hitsArray = (result as any).hits ?? [
        {
          id: enemy.id,
          damage: (result as any).damage ?? totalDamage,
          didMiss: false,
        },
      ];
      const ctx = { reason: "counter", totalDamage, hits: hitsArray };
      if (!hasTag(enemy, "attack")) addTag(enemy, "attack");
      const rule = (weapon.retaliationRule as "t1" | "t2" | "t3") ?? "t1";

      if (cfg) {
        const cfgLocal = cfg;
        const widLocal = getSelectedWeapon()?.id ?? selectedWeaponId ?? 1;
        const hitsLocal = Array.isArray((result as any).hits)
          ? (result as any).hits.slice()
          : [
              {
                id: enemy.id,
                damage: (result as any).damage ?? totalDamage,
                didMiss: false,
              },
            ];

        const gapMs = 90;
        const weaponBaseMs: Record<number, number> = { 1: 480, 2: 380, 3: 640 };
        const defaultPreMsForHit = (h: any) => (h.didMiss ? 80 : 160);
        const abilityIconPosLocal =
          (window as any).__ability_glyph_pos ?? undefined;

        const DEFAULT_IMPACT_MS = 380;
        const impactRunFraction = 0.85;

        let maxFinish = 0;
        const now = Date.now();

        hitsLocal.forEach((h: any, idx: number) => {
          const targetEnemy = enemies.find((e) => e.id === h.id);
          if (!targetEnemy) return;

          const targetCopy = { ...targetEnemy };
          const preMs = defaultPreMsForHit(h);
          const ms = weaponBaseMs[widLocal] ?? 480;
          const startDelay = idx * gapMs;

          const impactOffsetRelative = Math.max(
            0,
            Math.round(preMs + ms * impactRunFraction)
          );
          const impactMs = DEFAULT_IMPACT_MS;

          const absStart = startDelay;
          const absImpact = startDelay + impactOffsetRelative;
          const absFinish = absImpact + impactMs;

          setTimeout(() => {
            const opts: any = { preMs, ms };
            if (abilityIconPosLocal) {
              opts.fromX = abilityIconPosLocal.x;
              opts.fromY = abilityIconPosLocal.y;
            }
            startAttackAnimation(cfgLocal, targetCopy as any, widLocal, opts);
          }, absStart);

          setTimeout(() => {
            const ix = targetCopy.x ?? 0;
            const iy =
              (targetCopy.y ?? 0) +
              (targetCopy.lineOffset ?? 0) +
              (targetCopy.yOffset ?? 0);
            spawnEnemyImpact(ix, iy, targetCopy.element, impactMs);

            const realTarget = enemies.find((e) => e.id === targetCopy.id);
            if (!realTarget) {
              if (DEBUG)
                console.log(
                  "[IMPACT] target not found (maybe removed):",
                  targetCopy.id
                );
              return;
            }

            if (h.didMiss || !(h.damage > 0)) {
              if (DEBUG)
                console.log("[IMPACT] miss or zero damage for", realTarget.id);
              return;
            }

            enqueueImpact(realTarget.id, async () => {
              try {
                const { died, prevHp, nowHp } = applyDamage(
                  realTarget,
                  h.damage ?? 0
                );
                if (DEBUG)
                  console.log("[IMPACT] applying", {
                    id: realTarget.id,
                    dmg: h.damage,
                    prevHp,
                    nowHp,
                    died,
                  });

                updateHud();

                if (died) {
                  await orchestrateAtomicDeaths(cfgLocal, enemies, [
                    realTarget,
                  ]);
                  updateHud();
                }
              } catch (err) {
                console.error("[IMPACT] error applying damage:", err);
              }
            }).catch((err) => {
              console.error("[enqueueImpact] unexpected error", err);
            });
          }, absImpact);

          maxFinish = Math.max(maxFinish, absFinish);
        });

        const RET_BUFFER = 120;
        const ctxCopy = {
          ...ctx,
          hits: ctx.hits ? ctx.hits.map((hh: any) => ({ ...hh })) : ctx.hits,
        };
        setTimeout(() => {
          queueEnemyRetaliationToHp(
            cfgLocal,
            enemy,
            enemies,
            ctxCopy,
            rule,
            abilityType,
            () => {
              console.log(
                "Monster retaliation complete, player interaction unlocked"
              );
            }
          );
        }, Math.max(0, maxFinish + RET_BUFFER));
      }
    }

    if (DEBUG) console.log("Результат удара:", result);
    updateHud();
  }
};

function getSelectedWeaponCfg(): WeaponCfg | null {
  if (!cfg?.weapons) return null;
  return cfg.weapons.find((w) => w.id === selectedWeaponId) ?? null;
}
function drawSelectedWeaponIcon(p: p5, x: number, y: number, size = 64) {
  if (!cfg?.weapons || !cfg.weapons.length) return;
  const weapon =
    cfg.weapons.find((w) => w.id === selectedWeaponId) ?? cfg.weapons[0];
  if (!weapon) return;

  // лёгкая анимация иконки
  const dy = Math.sin(p.frameCount / 10) * 1.5;
  //const img = (selectedIcons as any)[weapon.id] as p5.Image | undefined;
  //if (img) p.image(img, x + 260, y - 40 + dy, 64, 120);

  // какой элемент выбран (point ability)
  const selectedEl = getActiveElementFromPointAbility();

  // используем существующую функцию для расчёта мин/макс урона
  const dbg = DebugStatsPlayerDamage(cfg!.player, selectedEl);

  // отрисуем фон небольшой панели для текста (чтобы было читаемо)
  p.push();
  p.noStroke();
  p.fill(255, 220); // слегка прозрачный белый фон
  const panelW = 170;
  const panelH = 56;
  const panelX = x + 200;
  const panelY = y + size / 2 - 8 + 20;
  p.rect(panelX, panelY, panelW, panelH, 6);

  // текст: атака
  p.fill(0);
  p.textSize(14);
  p.textAlign(p.LEFT, p.TOP);
  p.text(`Атака: ${dbg.min} – ${dbg.max}`, panelX + 10, panelY + 6);

  // защита (def) — берём из конфига игрока
  const def = cfg?.player?.def ?? 0;
  p.textSize(13);
  p.text(`Защита: ${def}`, panelX + 10, panelY + 28);

  // опционально — отображаем выбранную стихию рядом (маленькой серой)
  p.fill(80);
  p.textSize(11);
  p.textAlign(p.RIGHT, p.TOP);
  p.text(`${selectedEl}`, panelX + panelW - 8, panelY + 6);

  p.pop();
}

let lastPlayerDebugLine = "";
const ELEMENTS_4: ElementKey[] = ["earth", "fire", "water", "cosmos"];
function DebugStatsPlayerDamage(
  player: PlayerCfg,
  selectedElement: ElementKey
) {
  const atkMin = player.attack.min;
  const atkMax = player.attack.max;
  const luck = player.luck ?? 0;
  const abilityPctSel = player.elements?.[selectedElement] ?? 1;
  const pureMinSel = Math.floor(atkMin * abilityPctSel);
  const pureMaxSel = Math.floor(atkMax * abilityPctSel);

  const parts: string[] = [];
  for (const el of ELEMENTS_4) {
    const pct = player.elements?.[el] ?? 1;
    const dmin = Math.floor(atkMin * pct);
    const dmax = Math.floor(atkMax * pct);
    parts.push(`${el}=${dmin}-${dmax}`);
  }

  const line = `PLAYER base=${atkMin}-${atkMax} | luck=${luck} | + selected=${selectedElement}(${Math.round(
    abilityPctSel * 100
  )}%) | + pure=${pureMinSel}-${pureMaxSel} | ALL[ ${parts.join(" | ")} ]`;

  if (line !== lastPlayerDebugLine) {
    if (DEBUG) console.log(line);
    lastPlayerDebugLine = line;
  }

  return { min: pureMinSel, max: pureMaxSel };
}

(async () => {
  await loadConfig();
  new p5(sketch);

  document
    .getElementById("restart")
    ?.addEventListener("click", () => resetSession());

  const fileInput = document.getElementById("file") as HTMLInputElement | null;
  fileInput?.addEventListener("change", (ev) => {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    input.files[0].text().then((txt) => {
      // остановим / удалим старый счётчик — чтобы новый resetSession создал корректный
      try {
        (window as any).__turnCounter?.stop();
        // (window as any).__turnCounter?.destroy?.();
      } catch (e) {}
      cfg = JSON.parse(txt) as Cfg;
      normalizeConfig();
      resetSession();
    });
  });
})();
