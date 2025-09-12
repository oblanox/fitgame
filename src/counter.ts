// src/counter.ts
// Небольшой, надёжный таймер/счётчик ходов.
// Особенность: общий time-budget фиксируется один раз (baseline) и не реагирует на изменения remaining,
// однако getRemaining() всё ещё мониторится — при достижении 0 вызывается onZero().

import { Cfg } from "./types";

export type CounterOptions = {
  cfg?: Cfg | null;
  getRemaining: () => number;
  setRemaining: (n: number) => void;
  onTick?: (
    remaining: number,
    elapsedMsInCurrentTurn: number,
    elapsedTotalMs?: number
  ) => void;
  onTurn?: (remaining: number) => void;
  onZero?: () => void;
  msPerTurn?: number;
  tickIntervalMs?: number;
  autoStart?: boolean;
  /**
   * Если true — при каждом истечении msPerTurn модуль уменьшает remaining через setRemaining.
   * Если false — remaining не меняется автоматически (по умолчанию false).
   */
  decrementOnTurn?: boolean;
  /**
   * Если задано — используем это значение как зафиксированное количество шагов (count),
   * baselineCount = initialCount. Если null/undefined — снимок будет сделан при start() из getRemaining().
   */
  initialCount?: number | null;
  /**
   * При reset(value) — если true (default) — использовать value для пересчёта baselineCount/totalBudget.
   * Если false — reset не изменяет baselineCount (бюджет времени остаётся прежним).
   */
  recomputeBudgetOnReset?: boolean;
};

export type CounterHandle = {
  start: () => void;
  stop: () => void;
  reset: (value?: number) => void;
  isRunning: () => boolean;
  getRemaining: () => number;
  destroy: () => void;
};

export function createCounter(opts: CounterOptions): CounterHandle {
  const {
    cfg = null,
    getRemaining,
    setRemaining,
    onTick,
    onTurn,
    onZero,
    msPerTurn,
    tickIntervalMs = 200,
    autoStart = false,
    decrementOnTurn = false,
    initialCount = null,
    recomputeBudgetOnReset = true,
  } = opts;

  function resolveMsPerTurn() {
    // 1) явная опция при создании
    if (typeof msPerTurn === "number" && msPerTurn > 0) return msPerTurn;

    // 2) из cfg.timer.turnMs (рекомендуемый), затем старое место rules.turnMs для совместимости
    const fromCfg =
      (cfg as any)?.timer?.turnMs ??
      (cfg as any)?.rules?.turnMs ??
      (cfg as any)?.rules?.turnTimeMs ??
      null;

    if (typeof fromCfg === "number" && fromCfg > 0) {
      const v = Number(fromCfg);

      // верхний предел: берём cfg.timer.maxTurnMs если указан, иначе fallback 10 минут (600000 ms)
      // ---------- <- если хотите УБРАТЬ предел — возвращайте `v` прямо (без Math.min)
      const maxFromCfg = (cfg as any)?.timer?.maxTurnMs;
      const hardMax =
        typeof maxFromCfg === "number" &&
        Number.isFinite(maxFromCfg) &&
        maxFromCfg > 0
          ? Number(maxFromCfg)
          : 10 * 60 * 1000; // 10 минут по-умолчанию

      return Math.min(v, hardMax);
    }

    // sensible default (10s)
    return 10_000;
  }

  let running = false;
  let lastNow =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  // progress inside current turn (ms)
  let accMs = 0;
  // total elapsed since start/reset (ms)
  let elapsedTotalMs = 0;

  let resolvedMsPerTurn = resolveMsPerTurn();

  // baselineCount фиксируется и не меняется при ударах (если не разрешено recompute)
  // если initialCount указан — используем его; иначе baselineCount = null -> снимок при start()
  let baselineCount: number | null =
    typeof initialCount === "number" && Number.isFinite(initialCount)
      ? Math.max(0, Math.floor(initialCount))
      : null;

  // total budget in ms = baselineCount * resolvedMsPerTurn (computed on start/reset)
  let totalBudgetMs =
    baselineCount !== null ? baselineCount * resolvedMsPerTurn : 0;

  let rafId: number | null = null;
  let intervalId: number | null = null;

  function tickLoop(now: number) {
    if (!running) return;
    const delta = Math.max(0, now - lastNow);
    lastNow = now;

    accMs += delta;
    elapsedTotalMs += delta;

    // if player spent all hits externally -> immediate onZero
    const curRemaining = Math.max(0, Math.floor(getRemaining() ?? 0));
    if (curRemaining <= 0) {
      try {
        if (onZero) onZero();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[counter] onZero error", e);
      }
      stop();
      return;
    }

    // if baselineCount defined -> use totalBudgetMs fixed; otherwise we will not check budget here
    if (
      baselineCount !== null &&
      totalBudgetMs > 0 &&
      elapsedTotalMs >= totalBudgetMs
    ) {
      try {
        if (onZero) onZero();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[counter] onZero error (time budget exceeded)", e);
      }
      stop();
      return;
    }

    // onTick: give current remaining, elapsed inside current turn and total elapsed
    try {
      if (onTick) onTick(curRemaining, accMs, elapsedTotalMs);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[counter] onTick error", e);
    }

    // handle end of one-or-more msPerTurn intervals
    if (accMs >= resolvedMsPerTurn) {
      const steps = Math.floor(accMs / resolvedMsPerTurn);
      accMs = accMs - steps * resolvedMsPerTurn;

      for (let i = 0; i < steps; i++) {
        const cur = Math.max(0, Math.floor(getRemaining() ?? 0));
        if (cur <= 0) {
          try {
            if (onZero) onZero();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[counter] onZero error", e);
          }
          stop();
          return;
        }

        if (decrementOnTurn) {
          const next = Math.max(0, cur - 1);
          try {
            setRemaining(next);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[counter] setRemaining failed", e);
          }
          try {
            if (onTurn) onTurn(next);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[counter] onTurn error", e);
          }
          if (next <= 0) {
            try {
              if (onZero) onZero();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn("[counter] onZero error", e);
            }
            stop();
            return;
          }
        } else {
          try {
            if (onTurn) onTurn(cur);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[counter] onTurn error", e);
          }
        }
      }
    }

    // schedule next tick
    rafId =
      typeof requestAnimationFrame !== "undefined"
        ? requestAnimationFrame((t) => tickLoop(t))
        : (setTimeout(
            () => tickLoop(Date.now()),
            tickIntervalMs
          ) as unknown as number);
  }

  function start() {
    if (running) return;
    resolvedMsPerTurn = resolveMsPerTurn();

    // если baselineCount ещё не задан - снимем snapshot из getRemaining()
    if (baselineCount === null) {
      const cur = Math.max(0, Math.floor(getRemaining() ?? 0));
      baselineCount = cur;
    }
    totalBudgetMs = baselineCount * resolvedMsPerTurn;

    running = true;
    lastNow =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    accMs = 0;
    elapsedTotalMs = 0;

    if (typeof requestAnimationFrame !== "undefined") {
      rafId = requestAnimationFrame((t) => tickLoop(t));
    } else {
      intervalId = setInterval(() => {
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        tickLoop(now);
      }, tickIntervalMs) as unknown as number;
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId !== null) {
      try {
        cancelAnimationFrame(rafId);
      } catch {}
      rafId = null;
    }
    if (intervalId !== null) {
      try {
        clearInterval(intervalId);
      } catch {}
      intervalId = null;
    }
  }

  function reset(value?: number) {
    stop();
    accMs = 0;
    elapsedTotalMs = 0;
    resolvedMsPerTurn = resolveMsPerTurn();

    if (typeof value === "number") {
      try {
        setRemaining(Math.max(0, Math.floor(value)));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[counter] setRemaining failed during reset", e);
      }
      if (recomputeBudgetOnReset) {
        baselineCount = Math.max(0, Math.floor(value));
        totalBudgetMs = baselineCount * resolvedMsPerTurn;
      }
    }
    // if value not provided and baselineCount is null, baseline will be snapshotted on start()
  }

  function getRemainingWrapper() {
    return Math.max(0, Math.floor(getRemaining() ?? 0));
  }

  function isRunning() {
    return running;
  }

  function destroy() {
    stop();
    // GC will collect closures
  }

  if (autoStart) start();

  return {
    start,
    stop,
    reset,
    isRunning,
    getRemaining: getRemainingWrapper,
    destroy,
  };
}
