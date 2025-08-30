// Общие типы, которые нужны и main.ts, и animations.ts
export type ElementKey = "earth" | "fire" | "water" | "cosmos" | "none";

export type Padding = { left: number; right: number; top: number; bottom: number };

export type FieldCfg = {
  bg?: string;
  line?: string;
  rows?: number;
  widthRatio?: number;
  padding?: Padding;
  lineInsetTop?: number;
  lineInsetBottom?: number;
  lineThickness?: number;
  lineStep?: number;
};

export type PlayerCfg = {
  hpMax: number;
  hp: number;
  hits: number;
  luck: number;
  def: number;
  maxHits: number;
  elements?: Partial<Record<ElementKey, number>>;
  attack: { min: number; max: number };
  // опционально: колбек при получении урона
  onDamaged?: (dmg: number, enemy: Enemy, reason?: string) => void;
};

export type BossCfg = {
  type: number;
  element: string | ElementKey;
  hp: number;
  atk: number;
  row?: number;
  col?: number;
  radius?: number;
  lineOffset?: number;
};

export type MinionCfg = {
  id: number;
  type: number;
  element: string | ElementKey;
  hp: number;
  atk: number;
  row?: number;
  col?: number;
  radius?: number;
  lineOffset?: number;
};

export type WeaponCfg = {
  id: number;
  name: string;
  kind?: string;
  miss?: {
    baseByPos?: number[];
    luckStep?: number;
    luckPerStepPct?: number;
  };
  retaliationRule?: "t1" | "t2" | "t3";
};

export type ElementMatrixCfg = Record<ElementKey, Record<ElementKey, number>>;

export type Cfg = {
  field?: FieldCfg;
  player: PlayerCfg;
  boss: BossCfg;
  minions: MinionCfg[];
  weapons: WeaponCfg[];
  elementMatrix?: ElementMatrixCfg;
  // произвольные правила, которые использовала анимация
  rules?: Record<string, number | string>;
};

/**
 * Тип врага — минимальный набор полей, который использует отрисовка и анимация.
 * В main.ts у тебя могут быть расширения; здесь — только нужное.
 */
export type Enemy = {
  id: number;
  kind: "minion" | "boss";
  type: number;
  element: ElementKey;
  hp: number;
  atk: number;
  row: number;
  col: number;
  x: number;
  y: number;
  r: number;
  lineOffset?: number;
  // возможны доп. поля (yOffset, __outlineKick) — добавляем как индексируемые:
  [k: string]: any;
};
