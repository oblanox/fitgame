// src/combat.ts
import { ElementKey, ElementMatrixCfg, PlayerCfg, WeaponCfg, Enemy } from "./types";

export const DEFAULT_ELEMENT_MATRIX: ElementMatrixCfg = {
  earth: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  fire: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  water: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  cosmos: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
  none: { earth: 1, fire: 1, water: 1, cosmos: 1, none: 1 },
};

export function rollByLuck(minVal: number, maxVal: number, luck: number): number {
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

export function getMissForWeapon(weapon: WeaponCfg, pos1to4: number, luck: number) {
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

/** applyDamage — только уменьшение HP (без побочных эффектов) */
export function applyDamage(target: Enemy, dmg: number) {
  target.hp = Math.max(0, target.hp - dmg);
}
