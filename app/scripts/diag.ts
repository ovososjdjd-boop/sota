/**
 * Диагностика: что именно не размещается и почему.
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

  for (const limit of [undefined, 90, 60]) {
    const menu = await planMenu(
      { budget: 15000, days: 30, eaters: [makeEaterLike()], preferences: prefs, maxCookingMinutes: limit },
      RECIPES,
    );
    if (menu.status !== 'optimal') {
      console.log(limit, menu.status);
      continue;
    }
    const ordered = menu.demands.reduce((s, d) => s + d.portions, 0);
    const unplaced = menu.schedule.unplaced.reduce((s, x) => s + x.portions, 0);

    // сколько калорий реально в расписании
    let schedKcal = 0;
    let emptyMeals = 0;
    for (const day of menu.schedule.days) {
      schedKcal += day.nutrients.kcal;
      for (const m of day.meals) if (m.dishes.length === 0 && m.slot !== 'snack') emptyMeals++;
    }

    console.log(
      `лимит ${String(limit ?? '—').padEnd(3)}  заказано ${ordered}  не размещено ${unplaced} (${((unplaced / ordered) * 100).toFixed(0)}%)  ` +
        `ккал в расписании ${Math.round(schedKcal)} из ${Math.round(menu.actual.kcal)} (${((schedKcal / menu.actual.kcal) * 100).toFixed(0)}%)  пустых ${emptyMeals}`,
    );
    console.log(
      '   не размещено: ' +
        menu.schedule.unplaced
          .sort((a, b) => b.portions - a.portions)
          .slice(0, 12)
          .map((x) => `${x.recipe.name} ×${x.portions} [${x.recipe.role}/${x.recipe.slots.join(',')}]`)
          .join('; '),
    );
  }
}
