# Супер‑абилити AB5–AB8 — описание и расчёт

Ниже — человеческое описание каждого эффекта (что должно произойти), а затем — **модуль расчёта**: входные данные, шаги и псевдокод. Все формулы опираются на уже принятые в проекте функции:

* `rollByLuck(min, max, luck)` — ролл урона, смещённый к максимуму удачей;
* `getCritFromLuck(luck)` — шанс крита: ⌊luck/10⌋ %, множитель ×2;
* `getMissForWeapon(weapon, posIdx, luck)` — шанс промаха по позиции с учётом удачи;
* `getElemCoef(matrix, atkEl, defEl)` — коэффициент стихий атакующего к стихии цели.

---

## AB5 — «Отскок» (Огонь)

### Что должно произойти

Удар по выбранной цели **+** дополнительный удар по **второй ближайшей** живой цели (по евклидовой дистанции). Оба удара считаются **независимо** (свой ролл, крит, промах). Базовая стихия — `fire`.

### Модуль расчёта

**Вход:** `player`, `weapon`, `primary`, `allEnemies`, `matrix`.

**Шаги:**

1. Определяем стихию: `ability = "fire"` и процент `abilityPct = player.elements.fire ?? 1`.
2. «Чистое» окно: `pure = [floor(min×abilityPct), floor(max×abilityPct)]`.
3. Ищем вторую цель: ближайшая живая `secondary` ≠ `primary`.
4. Для **каждой** цели считаем:

   * `coef = getElemCoef(matrix, ability, enemy.element)`
   * Окно по цели: `vs = [floor(pureMin×coef), floor(pureMax×coef)]`
   * Позиция: `posIdx = clamp(enemy.row, 1..4)`
   * Промах: `missPct = getMissForWeapon(weapon, posIdx, luck)`
   * Ролл: `baseRoll = rollByLuck(pureMin, pureMax, luck)`
   * Крит: `{critMul} = getCritFromLuck(luck)`
   * Итог: `final = didMiss ? 0 : round(baseRoll×coef×critMul)`

**Псевдокод:**

```ts
ability = "fire";
abilityPct = player.elements?.fire ?? 1;
pureMin = floor(player.attack.min * abilityPct);
pureMax = floor(player.attack.max * abilityPct);
secondary = nearestAlive(allEnemies, primary);
result1 = hit(pureMin, pureMax, ability, primary);
result2 = secondary ? hit(pureMin, pureMax, ability, secondary) : null;
```

> `hit(...)` — внутренняя обёртка, выполняющая шаги 4a–4f.

**Краевые случаи:** если вторую цель не нашли — наносится только основной удар.

---

## AB6 — «Разделение» (Земля)

### Что должно произойти

Удар по выбранной цели **+** удар по **одному соседу на той же линии (row)**. Сосед выбирается как ближайший по |Δx|. Оба удара считаются независимо. Базовая стихия — `earth`.

### Модуль расчёта

**Вход:** `player`, `weapon`, `primary`, `allEnemies`, `matrix`.

**Шаги:**

1. `ability = "earth"`, `abilityPct = player.elements.earth ?? 1`.
2. `pure = [floor(min×abilityPct), floor(max×abilityPct)]`.
3. Находим соседа: `neighbor = nearestAliveSameRow(allEnemies, primary)`.
4. Для каждой цели выполняем стандартный цикл (coef/окно/промах/ролл/крит/итог) как в AB5.

**Псевдокод:**

```ts
ability = "earth";
abilityPct = player.elements?.earth ?? 1;
pureMin = floor(min * abilityPct);
pureMax = floor(max * abilityPct);
neighbor = nearestAliveSameRow(allEnemies, primary);
result1 = hit(pureMin, pureMax, ability, primary);
result2 = neighbor ? hit(pureMin, pureMax, ability, neighbor) : null;
```

**Краевые случаи:** если соседа по линии нет — второй удар пропускается.

---

## AB7 — «Проникновение» (Вода)

### Что должно произойти

Удар по выбранной цели **+** удар по **следующей цели на той же линии (row)**, расположенной **«за» первичной** по оси X (меньше/больше — зависит от принятого направления; по умолчанию — `x > primary.x`). При необходимости можно вводить ослабление второго удара `penetrateCoef ≤ 1`.

Базовая стихия — `water`.

### Модуль расчёта

**Вход:** `player`, `weapon`, `primary`, `allEnemies`, `matrix`, `penetrateCoef=1.0`.

**Шаги:**

1. `ability = "water"`, `abilityPct = player.elements.water ?? 1`.
2. `pure = [floor(min×abilityPct), floor(max×abilityPct)]`.
3. `secondary = nextAliveSameRowForward(allEnemies, primary)` — ближайшая по оси X вперёд.
4. Для первичной цели — стандартный цикл.
5. Для второй цели — тот же цикл, но коэффициент умножаем на `penetrateCoef` (по умолчанию 1.0).

**Псевдокод:**

```ts
ability = "water";
abilityPct = player.elements?.water ?? 1;
pureMin = floor(min * abilityPct);
pureMax = floor(max * abilityPct);
secondary = nextAliveSameRowForward(allEnemies, primary);
result1 = hit(pureMin, pureMax, ability, primary);
result2 = secondary ? hit(pureMin, pureMax, ability, secondary, /*coefMul*/ penetrateCoef) : null;
```

**Краевые случаи:** если «следующей» цели нет — только основной удар.

---

## AB8 — «Смена» (без урона)

### Что должно произойти

Меняем **стихию цели**. Урон = **0**. Цена — **−2 хода**.

* Если на панели точечного удара выбрана стихия (`earth|fire|water|cosmos`) — поставить **её** цели.
* Если выбрано `off` (или получается `none`) — **циклически** сменить стихию цели по порядку: `earth → fire → water → cosmos → earth`.

### Модуль расчёта

**Вход:** `player`, `enemy`, `desiredEl` (из панели точечного удара) и счётчик ходов `hitsLeft`.

**Шаги:**

1. `fromEl = enemy.element`.
2. `toEl = desiredEl !== "none" ? desiredEl : cycle(fromEl)`.
3. `enemy.element = toEl`.
4. `hitsLeft = max(0, hitsLeft - 2)` и `updateHud()`.

**Псевдокод:**

```ts
const ORDER = ["earth","fire","water","cosmos"] as const;
function cycle(el){ const i = ORDER.indexOf(el); return ORDER[(i+1) % ORDER.length]; }

function ab8ChangeElement(enemy, desiredEl){
  const fromEl = enemy.element;
  const toEl = desiredEl !== "none" ? desiredEl : cycle(fromEl);
  enemy.element = toEl;
  hitsLeft = Math.max(0, hitsLeft - 2);
  updateHud?.();
  return { changed: fromEl !== toEl, from: fromEl, to: toEl };
}
```

**Краевые случаи:** если цель уже имеет требуемую стихию — изменение возможно быть «без эффекта», но ход всё равно списывается (по ТЗ можно уточнить — оставить как есть или не списывать в таком случае).

---

## Общая вспомогательная функция `hit(...)`

Чтобы не дублировать логику ab5–ab7, удобно использовать общий helper:

```ts
function hit(pureMin, pureMax, ability, target, coefMul = 1.0){
  const luck   = player.luck ?? 0;
  const coef   = getElemCoef(matrix, ability, target.element) * coefMul;
  const vsMin  = Math.floor(pureMin * coef);
  const vsMax  = Math.floor(pureMax * coef);
  const posIdx = Math.max(1, Math.min(4, target.row));
  const { missPct } = getMissForWeapon(weapon, posIdx, luck);

  // Ролл/крит/промах
  const baseRoll = rollByLuck(pureMin, pureMax, luck);
  const { didCrit, critMul } = getCritFromLuck(luck);
  const rolledVsElem = Math.round(baseRoll * coef * critMul);
  const { didMiss } = getMissForWeapon(weapon, posIdx, luck);
  const finalDamage = didMiss ? 0 : rolledVsElem;

  return { vsMin, vsMax, missPct, baseRoll, didCrit, finalDamage };
}
```

> Так упрощается код всех супер‑абилити и логирование становится единообразным.
