/**
 * Как время готовки распределено между днями.
 *
 * Подозрение: раскладка идёт по дням слева направо и набивает первые
 * дни под завязку, а хвост периода остаётся полупустым. Тогда «дней
 * сверх лимита 18 из 30» — это не нехватка блюд, а неравномерность.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  for (const lim of [60, undefined]) {
    const m = await planMenu(
      {
        budget: 15000,
        days: 30,
        eaters: [makeEaterLike()],
        preferences: prefs,
        maxCookingMinutes: lim,
      },
      RECIPES,
    );
    if (m.status !== 'optimal') continue;
    console.log(`\n=== лимит ${lim ?? '—'} ===`);
    for (const d of m.schedule.days) {
      const kcal = Math.round(d.nutrients.kcal);
      const pct = Math.round((d.nutrients.kcal / d.targetKcal) * 100);
      const cooks = d.meals.flatMap((x) => x.dishes).filter((x) => x.cooked).length;
      const reheat = d.meals.flatMap((x) => x.dishes).filter((x) => !x.cooked).length;
      console.log(
        `день ${String(d.index + 1).padStart(2)}  ${String(kcal).padStart(4)} ккал (${String(pct).padStart(3)}%)  ` +
          `${String(d.minutes).padStart(3)} мин  готовок ${cooks} разогревов ${reheat}  ` +
          d.meals.map((x) => `${x.slot[0]}${x.dishes.length}`).join(' '),
      );
    }
  }
}
