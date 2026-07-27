/**
 * Проверка гипотезы: не помещается не по КАЛОРИЯМ, а по МЕСТАМ.
 *
 * Раскладка допускает одно блюдо каждой ролевой группы в приём
 * (две каши в один завтрак — не разнообразие, а ошибка). Значит
 * число мест для группы жёстко ограничено: дни × подходящие приёмы.
 * Фаза 1 об этом не знает и заказывает больше, чем можно разложить.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

const ROLE_GROUP: Record<string, string> = {
  porridge: 'base', side: 'base', soup: 'soup', main: 'main',
  salad: 'salad', snack: 'snack', drink: 'drink', bakery: 'bakery',
};

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  prefs.products['pork'] = 'often';
  prefs.products['chicken_fillet'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  const days = 30;
  const menu = await planMenu(
    { budget: 15000, days, eaters: [makeEaterLike()], preferences: prefs },
    RECIPES,
  );
  if (menu.status !== 'optimal') return console.log(menu.status);

  // заказано порций по группам
  const ordered = new Map<string, number>();
  const slotsOf = new Map<string, Set<string>>();
  for (const d of menu.demands) {
    const g = ROLE_GROUP[d.stats.recipe.role];
    ordered.set(g, (ordered.get(g) ?? 0) + d.portions);
    const s = slotsOf.get(g) ?? new Set<string>();
    for (const x of d.stats.recipe.slots) s.add(x);
    slotsOf.set(g, s);
  }

  // размещено
  const placed = new Map<string, number>();
  for (const day of menu.schedule.days)
    for (const m of day.meals)
      for (const dish of m.dishes) {
        const g = ROLE_GROUP[dish.recipe.role];
        placed.set(g, (placed.get(g) ?? 0) + dish.portions);
      }

  console.log('группа   заказано  размещено  мест (дни×приёмы)  приёмы');
  for (const [g, n] of [...ordered.entries()].sort((a, b) => b[1] - a[1])) {
    const slots = [...(slotsOf.get(g) ?? [])];
    const capacity = days * slots.length;
    const p = placed.get(g) ?? 0;
    const flag = n > capacity ? '  ← ЗАКАЗАНО БОЛЬШЕ, ЧЕМ ЕСТЬ МЕСТ' : '';
    console.log(
      `${g.padEnd(8)} ${String(n).padStart(8)} ${String(p).padStart(10)} ${String(capacity).padStart(18)}  ${slots.join(',')}${flag}`,
    );
  }

  // сколько мест реально заняли напитки
  let drinkMeals = 0;
  let snackMeals = 0;
  for (const day of menu.schedule.days)
    for (const m of day.meals) {
      if (m.dishes.some((d) => d.recipe.role === 'drink')) drinkMeals++;
      if (m.dishes.some((d) => d.recipe.role === 'snack')) snackMeals++;
    }
  console.log(`\nприёмов с напитком: ${drinkMeals}, с перекусом: ${snackMeals} (дней ${days})`);
}
