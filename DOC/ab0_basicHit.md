<<<<<<< HEAD
# Формула основного удара (ab0)

## 1. Базовое окно урона

Берём минимальный и максимальный урон игрока из конфигурации:

```ts
baseMin = player.attack.min;
baseMax = player.attack.max;
```

- это **чистый диапазон** урона оружием;
- для обычного удара (ab0) проценты стихий не применяются, коэффициент всегда `1.0`.

---

## 2. Ролл урона с учётом удачи

```ts
function rollByLuck(minVal, maxVal, luck) {
  const L = clamp(luck / 100, 0, 1); // нормируем удачу в 0..1
  const exp = Math.max(0.3, 1 - 0.7 * L); // экспонента от 1.0 до 0.3
  const u = Math.random() ** exp; // чем меньше exp, тем ближе u к 1
  return Math.round(minVal + (maxVal - minVal) * u);
}
```

**Комментарий:**

- При `luck=0` → `exp=1` → `u=random` → равномерное распределение в \[min,max].
- При `luck=100` → `exp=0.3` → `u=random^0.3` → смещение в сторону **максимума**.
- Таким образом, удача **не увеличивает диапазон**, а меняет распределение: урон чаще ближе к `max`.

---

## 3. Критический удар

```ts
function getCritFromLuck(luck) {
  const pct = Math.floor(luck / 10); // каждые 10 удачи = +1% крит
  const did = Math.random() * 100 < pct;
  return { critMul: did ? 2 : 1, didCrit: did, critPct: pct };
}
```

**Комментарий:**

- При `luck=8` → шанс крита 0%.
- При `luck=80` → шанс крита 8%.
- Критический удар **удваивает** итоговый урон.

---

## 4. Проверка на промах

В оружии есть таблица промахов по позициям (например, `[15,30,45,60]`):

```ts
function getMissForWeapon(weapon, posIdx, luck) {
  const base = weapon.miss.baseByPos[posIdx - 1];
  const step = weapon.miss.luckStep ?? 10; // каждые 10 удачи
  const per = weapon.miss.luckPerStepPct ?? 1; // снижаем шанс промаха на 1%
  const steps = Math.floor(luck / step);
  const missPct = Math.max(0, base - steps * per);
  const didMiss = Math.random() * 100 < missPct;
  return { missPct, didMiss };
}
```

**Комментарий:**

- При `luck=0` → берём `base`.
- При `luck=100` → шанс промаха уменьшается на 10% (10 шагов × 1%).
- Промах полностью обнуляет урон.

---

## 5. Итоговая формула

1. Роллим базовый урон:

   ```
   roll = rollByLuck(baseMin, baseMax, luck)
   ```

2. Проверяем крит:

   ```
   rollCrit = roll * critMul   // critMul = 1 или 2
   ```

3. Проверяем промах:

   ```
   finalDamage = didMiss ? 0 : rollCrit
   ```

---

## 🔎 Пример

Игрок:

- `attack.min=20, attack.max=40`
- `luck=80`

Оружие (позиция 3):

- `miss.baseByPos=[15,30,45,60]`
- значит base=45% промаха.

**Расчёт:**

1. Ролл: `rollByLuck(20,40,80)` → чаще ближе к 40.
2. Крит: шанс 8%. Если выпал — ×2.
3. Промах: шанс = 45% − 8% = 37%.

Итого:

- Урон 0 (МИМО) с вероятностью 37%.
- Урон 20–40 (среднее ближе к 38) с вероятностью \~55%.
- Урон 40–80 (крит) с вероятностью \~8%.
=======

>>>>>>> de179f74d7756bbfe9cf9ce16e4246a6d7b53623
