// src/combat.ts
import {
  ElementKey,
  ElementMatrixCfg,
  PlayerCfg,
  WeaponCfg,
  Enemy,
  getTags,
  TagsMap,
  Cfg,
} from "./types";

let _isPlayerLock = false;

export function setPlayerLock(v: boolean) {
  _isPlayerLock = v;
}

export function getIsPlayerLock(): boolean {
  return _isPlayerLock;
}

// ----------------- конец Turn flags -----------------

export const DEFAULT_ELEMENT_MATRIX: ElementMatrixCfg = {
  earth: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  fire: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  water: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  cosmos: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  none: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
};

export function rollByLuck(
  minVal: number,
  maxVal: number,
  luck: number
): number {
  const L = Math.max(0, Math.min(1, luck / 100));
  const exp = Math.max(0.3, 1 - 0.7 * L);
  const u = Math.random() ** exp;
  return Math.round(minVal + (maxVal - minVal) * u);
}

export function getCritFromLuck(luck: number) {
  const pct = Math.floor(luck / 10);
  const did = Math.random() * 100 < pct;
  return { critPct: pct, didCrit: did, critMul: did ? 2 : 1 };
}

export function getMissForWeapon(
  weapon: WeaponCfg,
  pos1to4: number,
  luck: number
) {
  const base =
    weapon.miss?.baseByPos?.[Math.max(1, Math.min(4, pos1to4)) - 1] ?? 0;
  const step = weapon.miss?.luckStep ?? 10;
  const per = weapon.miss?.luckPerStepPct ?? 1;
  const steps = Math.floor(luck / step);
  const missPct = Math.max(0, Math.min(100, base - steps * per));
  const didMiss = Math.random() * 100 < missPct;
  return { missPct, didMiss };
}

export function getElemCoef(
  matrix: ElementMatrixCfg | undefined,
  atk: ElementKey,
  def: ElementKey
) {
  const M = matrix ?? DEFAULT_ELEMENT_MATRIX;
  return M[atk]?.[def] ?? 1.0;
}

export function abilityPctFor(player: PlayerCfg, el: ElementKey) {
  if (el === "none") return 1;
  let v = player.elements?.[el] ?? 1;
  if (v > 1.001) v /= 100;
  return v;
}

export function computeSingleHit(
  player: PlayerCfg,
  weapon: WeaponCfg,
  target: Enemy,
  matrix: ElementMatrixCfg | undefined,
  element: ElementKey,
  coefMul = 1.0,
  skipMatrix = false
) {
  const luck = player.luck ?? 0;
  const pct = abilityPctFor(player, element);
  const pureMin = Math.floor(player.attack.min * pct);
  const pureMax = Math.floor(player.attack.max * pct);

  const baseCoef = skipMatrix
    ? 1.0
    : getElemCoef(matrix ?? DEFAULT_ELEMENT_MATRIX, element, target.element);
  const coef = baseCoef * coefMul;

  const posIdx = Math.max(1, Math.min(4, Number(target.row ?? 1)));
  const { missPct, didMiss } = getMissForWeapon(weapon, posIdx, luck);

  const baseRoll = rollByLuck(pureMin, pureMax, luck);
  const { didCrit, critMul } = getCritFromLuck(luck);
  const rolledVsElem = Math.round(baseRoll * coef * critMul);
  const finalDamage = didMiss ? 0 : rolledVsElem;

  return { finalDamage, didMiss, didCrit, critMul, baseRoll, missPct };
}

// src/combat.ts
// --- идемпотентная реализация applyDamage ---
/**
 * Применяет урон к цели. Идемпотентна: если цель уже мертва (hp <= 0), не меняет её.
 * Возвращает объект с информацией о предыдущем и новом HP и флагом died.
 */
export function applyDamage(
  target: Enemy,
  dmg: number
): { died: boolean; prevHp: number; nowHp: number } {
  // защитная нормализация
  const prev = typeof target.hp === "number" ? target.hp : 0;
  if (prev <= 0) {
    // уже мёртв — ничего не делаем
    return { died: false, prevHp: prev, nowHp: prev };
  }

  // нормализуем dmg
  let damage = Number.isFinite(dmg) ? Math.max(0, Math.floor(dmg)) : 0;

  // применяем урон (не допускаем отрицательного HP)
  target.hp = Math.max(0, prev - damage);
  const died = prev > 0 && target.hp === 0;

  return { died, prevHp: prev, nowHp: target.hp };
}
// --- конец applyDamage ---

// установить/увеличить тег (counted)
export function addTag(enemy: Enemy, tag: string, meta: any = true) {
  const tags = getTags(enemy);
  if (typeof tags[tag] === "number") {
    tags[tag] = (tags[tag] as number) + 1;
  } else if (tags[tag]) {
    // если уже установлено не числом — сохраняем в объект {count: n, meta}
    tags[tag] = { count: 2, meta };
  } else {
    // по умолчанию ставим счётчик 1 (число) и дополнительную мета-информацию в tags[`${tag}_meta`]
    tags[tag] = 1;
    if (meta !== true) tags[`${tag}_meta`] = meta;
  }
}

// снять/декрементировать тег; если дошли до нуля — удалить
export function removeTag(enemy: Enemy, tag: string) {
  const tags = (enemy.__tags as TagsMap) ?? undefined;
  if (!tags || !tags[tag]) return;

  const v = tags[tag];
  if (typeof v === "number") {
    const next = (v as number) - 1;
    if (next <= 0) {
      delete tags[tag];
      delete tags[`${tag}_meta`];
    } else {
      tags[tag] = next;
    }
  } else if (
    typeof v === "object" &&
    v !== null &&
    typeof v.count === "number"
  ) {
    v.count -= 1;
    if (v.count <= 0) {
      delete tags[tag];
      delete tags[`${tag}_meta`];
    } else {
      tags[tag] = v;
    }
  } else {
    // non-counted value — просто удалим
    delete tags[tag];
    delete tags[`${tag}_meta`];
  }
  // если __tags пуст, можно удалить объект целиком (чтобы не мусорить)
  if (Object.keys(tags).length === 0) delete enemy.__tags;
}

// проверить наличие тега (truthy)
export function hasTag(enemy: Enemy, tag: string): boolean {
  const tags = enemy.__tags as TagsMap | undefined;
  if (!tags) return false;
  const v = tags[tag];
  if (!v) return false;
  if (typeof v === "number") return v > 0;
  if (typeof v === "object" && typeof v.count === "number") return v.count > 0;
  return true;
}

// полное удаление тега
export function clearTag(enemy: Enemy, tag: string) {
  const tags = enemy.__tags as TagsMap | undefined;
  if (!tags) return;
  delete tags[tag];
  delete tags[`${tag}_meta`];
  if (Object.keys(tags).length === 0) delete enemy.__tags;
}

export function getBossDamageMultiplier(cfg: Cfg, boss: Enemy): number {
  const type = boss?.type ?? 1;
  const pos = boss?.row ?? 4;
  const minions = (cfg.minions ?? []).filter((m) => m.hp > 0);
  const minionCount = minions.length;

  switch (type) {
    case 1: {
      const tLeft = (cfg as any).__turnsLeft ?? 10;
      const maxTurns = (cfg as any)?.timer?.turns ?? 10;
      const ratio = Math.max(
        0.1,
        Math.min(3.0, 3 - ((maxTurns - tLeft) / maxTurns) * 2.9)
      );
      return ratio; // от 3.0 до 0.1
    }
    case 2:
      if (pos === 4) return 4.0;
      if (pos === 3) return 3.0;
      if (pos === 2) return 2.0;
      return 1.0;
    case 3: {
      const multiplier = Math.max(0.1, minionCount * 1.0); // 0.1..5.0
      return multiplier;
    }
    default:
      return 1.0;
  }
}
