// src/death.ts
import { Cfg, Enemy } from "./types";
import { startEnemyDeath } from "./animations";
import {
  layoutEnemies as layoutEnemiesModule,
  animateShiftToPositions as animateShiftToPositionsModule,
  advanceFormationIfNeeded as advanceFormationIfNeededModule,
} from "./layout";

/**
 * orchestrateAtomicDeaths
 * - cfg: конфиг (используется для правил/таймингов)
 * - enemiesRef: ссылка на массив enemies в main (мутируется при удалении)
 * - deadList: массив Enemy объектов, которые были помечены as dead (hp<=0) в рамках одного хита
 * - opts: опции { shiftMs?: number }
 *
 * Возвращает Promise, который резолвится после того как:
 *  - все death-анимации завершены,
 *  - все мёртвые удалены из enemiesRef,
 *  - произведён один единый пересчёт/анимация сдвига.
 */
export function orchestrateAtomicDeaths(
  cfg: Cfg,
  enemiesRef: Enemy[],
  deadList: Enemy[],
  opts: { shiftMs?: number } = {}
): Promise<void> {
  return new Promise((resolve) => {
    if (!cfg) {
      resolve();
      return;
    }
    if (!deadList || deadList.length === 0) {
      resolve();
      return;
    }

    const uniq = Array.from(
      new Map(deadList.map((d) => [d.id, d])).values()
    ) as Enemy[];
    const total = uniq.length;
    let finished = 0;
    const deadIds = uniq.map((d) => d.id as number);

    const rules: any = (cfg as any).rules ?? {};
    const shiftMs = Number(opts.shiftMs ?? rules.shiftMs ?? 360);

    // callback when one death animation finished
    const onOneDone = (dead: Enemy) => {
      finished++;
      if (finished >= total) {
        // REMOVE dead by id from enemiesRef
        for (const id of deadIds) {
          const idx = enemiesRef.findIndex((e) => e.id === id);
          if (idx >= 0) enemiesRef.splice(idx, 1);
        }
        // Advance formation according to policy (keeps parity with previous code)
        try {
          advanceFormationIfNeededModule(enemiesRef, cfg);
        } catch (e) {
          // ignore
        }
        // Recalculate targets and animate a single shift
        const newTargets = layoutEnemiesModule(cfg, enemiesRef);
        animateShiftToPositionsModule(enemiesRef, newTargets, shiftMs);
        resolve();
      }
    };

    // Start death animation for each dead enemy.
    // startEnemyDeath internally guards against double-start; but if it throws — count as finished.
    for (const e of uniq) {
      try {
        startEnemyDeath(cfg, e, onOneDone);
      } catch (err) {
        // If something fails starting an anim, avoid hang — treat as done.
        // (won't throw production-breaking errors)
        // eslint-disable-next-line no-console
        console.warn("[death] startEnemyDeath failed for", e?.id, err);
        onOneDone(e);
      }
    }
  });
}
