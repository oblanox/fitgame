# Точечный удар стихией (AB1–AB4) — подробная формула

Точечные абилки **обязательны** к выбору одной из стихий: `earth`, `fire`, `water`, `cosmos`.
Абилка `off` трактуется как `none` (без бонусов/штрафов стихий).

---

## Входные данные

* `player.attack.min`, `player.attack.max` — базовый урон игрока.
* `player.luck` — удача (0..100).
* `player.elements[el]` — процент урона от выбранной стихии `el` (в доле 0..1; допускается запись «в процентах» — 84 ⇒ 0.84 на этапе нормализации).
* `enemy.element` — стихия цели.
* `enemy.row` — позиция 1..4 (влияет на шанс промаха по оружию).
* `weapon.miss.baseByPos[1..4]`, `weapon.miss.luckStep` (по умолчанию 10), `weapon.miss.luckPerStepPct` (по умолчанию 1).
* `elementMatrix[atkEl][defEl]` — коэффициент взаимодействия стихий (по умолчанию 1.0).

---

## Шаг 1 — выбор активной стихии

```ts
ability = getActiveElementFromPointAbility() // "earth" | "fire" | "water" | "cosmos" | "none"
abilityPct = ability === "none" ? 1 : (player.elements?.[ability] ?? 1)
```

> Если в конфиге проценты указаны целыми (например, `84`), на этапе нормализации они приводятся к доле (`0.84`).

---

## Шаг 2 — «чистое» окно урона для выбранной стихии

```ts
pureMin = floor(player.attack.min * abilityPct)
pureMax = floor(player.attack.max * abilityPct)
```

Это диапазон до учёта врага и оружия.

---

## Шаг 3 — коэффициент против цели (матрица стихий)

```ts
coef = elementMatrix[ability]?.[enemy.element] ?? 1.0
vsMin = floor(pureMin * coef)
vsMax = floor(pureMax * coef)
```

`vsMin..vsMax` — ожидаемое окно по выбранной цели **без** учёта удачи/критов/промахов.

---

## Шаг 4 — ролл урона с учётом удачи

Смещение распределения к максимуму диапазона.

```ts
function rollByLuck(minVal: number, maxVal: number, luck: number) {
  const L   = Math.max(0, Math.min(1, luck / 100));
  const exp = Math.max(0.3, 1 - 0.7 * L); // luck: 0 ➜ exp=1 (равномерно), 100 ➜ exp=0.3 (сдвиг к max)
  const u   = Math.random() ** exp;
  return Math.round(minVal + (maxVal - minVal) * u);
}

baseRoll = rollByLuck(pureMin, pureMax, player.luck)
```

---

## Шаг 5 — критический удар

По ТЗ: каждые 10 удачи = +1% к шансу крита ×2.

```ts
critPct = Math.floor(player.luck / 10)      // 0..10%
{ didCrit, critMul } = getCritFromLuck(player.luck) // critMul = 1 | 2
```

---

## Шаг 6 — шанс промаха (оружие × позиция × удача)

```ts
posIdx  = clamp(enemy.row, 1, 4)
base    = weapon.miss.baseByPos[posIdx - 1] ?? 0
step    = weapon.miss.luckStep ?? 10
per     = weapon.miss.luckPerStepPct ?? 1
steps   = Math.floor(player.luck / step)
missPct = Math.max(0, Math.min(100, base - steps * per))

didMiss = Math.random() * 100 < missPct
```

---

## Шаг 7 — итоговый урон

```ts
rolledVsElem = Math.round(baseRoll * coef * critMul)
finalDamage  = didMiss ? 0 : rolledVsElem
```

---

## Псевдокод полной проверки (для логов)

```ts
function DebugStatsPointHitAgainstEnemy(player, weapon, enemy, matrix) {
  const baseMin = player.attack.min, baseMax = player.attack.max;
  const luck = player.luck ?? 0;

  const ability = getActiveElementFromPointAbility(); // стихия
  const abilityPct = ability === "none" ? 1 : (player.elements?.[ability] ?? 1);

  const pureMin = Math.floor(baseMin * abilityPct);
  const pureMax = Math.floor(baseMax * abilityPct);

  const coef   = (matrix?.[ability]?.[enemy.element]) ?? 1.0;
  const vsMin  = Math.floor(pureMin * coef);
  const vsMax  = Math.floor(pureMax * coef);

  const posIdx = Math.max(1, Math.min(4, enemy.row));
  const { missPct } = getMissForWeapon(weapon, posIdx, luck);
  const critPct = Math.floor(luck / 10);

  console.log(
    [
      "=== AB1–AB4: подробный расчёт ===",
      `Цель: #${enemy.id} (${enemy.kind}) elem=${enemy.element} row=${enemy.row}`,
      `База игрока: ${baseMin}-${baseMax}`,
      `Выбранная стихия: ${ability} (${(abilityPct*100).toFixed(0)}%)`,
      `Чистый урон: ${pureMin}-${pureMax}`,
      `Коэф(ability→enemy): ×${coef}`,
      `По цели: ${vsMin}-${vsMax}`,
      `Удача: ${luck} ⇒ крит=${critPct}%`,
      `Промах(pos=${posIdx}): ${missPct.toFixed(1)}%`
    ].join(" | ")
  );

  const baseRoll = rollByLuck(pureMin, pureMax, luck);
  const { didCrit, critMul } = getCritFromLuck(luck);
  const rolledVsElem = Math.round(baseRoll * coef * critMul);
  const { didMiss } = getMissForWeapon(weapon, posIdx, luck);
  const finalDamage = didMiss ? 0 : rolledVsElem;

  console.log(
    `Ролл: base=${baseRoll} | ${didCrit ? "КРИТ×2" : "без крита"} | по цели=${rolledVsElem} | результат: ${didMiss ? "МИМО" : "ПОПАЛ"} (${finalDamage})`
  );

  return { ability, abilityPct, coef, pureMin, pureMax, vsMin, vsMax, missPct, critPct, baseRoll, didCrit, didMiss, finalDamage };
}
```

---

## Частые ошибки/проверки

* `player.elements[el]` не передаётся в панель — тогда в логах всегда будет `100%`.
* Значение процента задано целым (например, `84`) — должно нормализоваться в `0.84`.
* Матрица `elementMatrix` не подана/пустая — тогда `coef = 1.0` и «по цели» совпадает с «чистым».
* `enemy.row` вне 1..4 — обязательно клампить перед обращением к `baseByPos`.
* `luck` за пределами 0..100 — клампить/округлять при нормализации.
