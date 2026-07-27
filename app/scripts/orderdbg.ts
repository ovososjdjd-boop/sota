/**
 * Сколько калорий ЗАКАЗЫВАЕТ фаза 1 и сколько доходит до тарелки.
 * Разделяем две разные болезни:
 *   а) заказано мало  → виноват солвер (ограничения/бюджет)
 *   б) заказано много, но не разложено → виновата раскладка
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  for (const lim of [undefined, 90, 60]) {
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
    if (m.status !== 'optimal') {
      console.log(lim, m.status);
      continue;
    }
    const orderedKcal = m.demands.reduce(
      (s, d) => s + d.stats.nutrients.kcal * d.portions,
      0,
    );
    const placedKcal = m.schedule.days.reduce((s, d) => s + d.nutrients.kcal, 0);
    const target = m.target.kcal;
    console.log(
      `лимит ${String(lim ?? '—').padEnd(3)}  цель ${Math.round(target)}  ` +
        `заказано ${Math.round(orderedKcal)} (${((orderedKcal / target) * 100).toFixed(0)}%)  ` +
        `на тарелке ${Math.round(placedKcal)} (${((placedKcal / target) * 100).toFixed(0)}%)  ` +
        `потери раскладки ${((1 - placedKcal / orderedKcal) * 100).toFixed(0)}%`,
    );
  }
}
