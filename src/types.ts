// Общие типы, которые нужны и main.ts, и animations.ts
export type ElementKey = "earth" | "fire" | "water" | "cosmos" | "none";

export type GameRules = {
  shiftMs?: number;
  chainGapMs?: number;
  outMs?: number;
  hitMs?: number;
  backMs?: number;
  dropPx?: number;
  deathMs?: number;
  retaliationMul?: number;
  bossRetaliationMul?: number;
};

export type Padding = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type FieldCfg = {
  bg?: string;
  line?: string;
  rows?: number;
  anchor?: string;
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

// --- TIMER types (cfg + runtime state) ---
export type TimerRegenCfg = {
  minionPct?: number;
  bossPct?: number;
};

export type TimerCfg = {
  // общее количество "ходов" (используется при ресете/инициализации)
  turns?: number;
  // миллисекунд на один ход
  turnMs?: number;
  // максимум ms на ход (защита/ограничение)
  maxTurnMs?: number;
  // при достижении конца хода — уменьшать число ходов (true/false)
  decrementOnTurn?: boolean;
  // реген через конфиг
  regen?: TimerRegenCfg;
};

export type TimerState = {
  // сколько ещё ходов осталось (integer)
  remainingTurns?: number;
  // миллисекунд осталось внутри текущего хода
  msLeftInTurn?: number;
  // прогресс внутри хода 0..1 (процент ПРОШЕДШЕГО времени)
  turnProgress?: number;
  // timestamp последнего тика (Date.now())
  lastTickAt?: number;
};

// --- Cfg (добавлено поле timer?: TimerCfg) ---
export type Cfg = {
  field?: FieldCfg;
  player: PlayerCfg;
  boss: BossCfg;
  minions: MinionCfg[];
  weapons: WeaponCfg[];
  elementMatrix?: ElementMatrixCfg;
  // таймер игры / ходов
  timer?: TimerCfg;
  // произвольные правила, которые использовала анимация
  rules?: GameRules;
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

export type TagsMap = Record<string, any>;

// safe accessor: создаёт __tags при первой записи
export function getTags(enemy: Enemy): TagsMap {
  if (!enemy.__tags || typeof enemy.__tags !== "object") {
    enemy.__tags = {};
  }
  return enemy.__tags as TagsMap;
}
