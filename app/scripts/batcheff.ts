/**
 * Совпадает ли оценка фазы 1 о batch cooking с реальностью.
 *
 * Фаза 1 считает, что одна готовка покрывает
 *   perCook = min(batchPortions, едоки × (keepsDays + 1))
 * порций. Если раскладка достигает меньшего, бюджет времени
 * тратится быстрее, чем думает солвер, и еда не влезает.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  for (const lim of [60, 90]) {
    const m = await planMenu(
      {
        budget: 15000,
        days: 30,
        eaters: [makeEaterLike()],
        preferences: emptyPreferences(),
        maxCookingMinutes: lim,
      },
      RECIPES,
    );
    if (m.status !== 'optimal') continue;

    // реально: сколько порций пришлось на одну готовку
    const cooks = new Map<string, { cooked: number; portions: number }>();
    for (const d of m.schedule.days)
      for (const meal of d.meals)
        for (const dish of meal.dishes) {
          const cur = cooks.get(dish.recipe.id) ?? { cooked: 0, portions: 0 };
          if (dish.cooked) cur.cooked++;
          cur.portions += dish.portions;
          cooks.set(dish.recipe.id, cur);
        }

    console.log(`\n=== лимит ${lim} ===`);
    let assumedTotal = 0;
    let realTotal = 0;
    const rows: string[] = [];
    for (const [id, v] of cooks) {
      const r = RECIPES.find((x) => x.id === id)!;
      const assumed = Math.max(1, Math.min(r.batchPortions, 1 * (r.keepsDays + 1)));
      const real = v.cooked > 0 ? v.portions / v.cooked : v.portions;
      assumedTotal += (r.minutes / assumed) * v.portions;
      realTotal += r.minutes * v.cooked;
      if (v.portions >= 3 && Math.abs(real - assumed) > 0.4) {
        rows.push(
          `  ${r.name.padEnd(30)} партия ${r.batchPortions}, хранится ${r.keepsDays} → ` +
            `фаза1 ждала ${assumed.toFixed(1)} порц/готовку, вышло ${real.toFixed(1)}`,
        );
      }
    }
    console.log(
      `оценка фазы 1: ${Math.round(assumedTotal)} мин, реально: ${Math.round(realTotal)} мин ` +
        `(бюджет ${lim * 30})  занижение ${((realTotal / assumedTotal - 1) * 100).toFixed(0)}%`,
    );
    for (const r of rows.slice(0, 12)) console.log(r);
  }
}
