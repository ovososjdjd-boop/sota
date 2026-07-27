/**
 * Почему лимит времени готовки роняет калорийность.
 *
 * Гипотеза: раскладка учитывает время «в лоб» — каждая готовка целиком
 * ложится на день. Но суп варится кастрюлей на 4 порции и стоит
 * в меню три дня: время платится один раз, а еда идёт три дня.
 * Если это не учитывать, дневной бюджет времени сгорает впустую.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  prefs.products['pork'] = 'often';
  prefs.products['chicken_fillet'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  for (const lim of [undefined, 90, 60, 40]) {
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
    let used = 0;
    let overLimit = 0;
    let emptyMeals = 0;
    const perDay: number[] = [];
    for (const d of m.schedule.days) {
      used += d.minutes;
      perDay.push(d.minutes);
      if (lim && d.minutes > lim) overLimit++;
      for (const meal of d.meals)
        if (meal.dishes.length === 0 && meal.slot !== 'snack') emptyMeals++;
    }
    const budgetMin = lim ? lim * 30 : Infinity;
    console.log(
      `лимит ${String(lim ?? '—').padEnd(3)} ккал/д ${(m.actual.kcal / 30).toFixed(0)}  ` +
        `время ${Math.round(used / 30)} мин/д (бюджет ${lim ?? '—'}), использовано ${
          lim ? ((used / budgetMin) * 100).toFixed(0) + '%' : '—'
        }  дней сверх лимита ${overLimit}  пустых приёмов ${emptyMeals}`,
    );
    console.log(
      `        по дням: ${perDay.slice(0, 15).join(' ')}`,
    );
  }
}
