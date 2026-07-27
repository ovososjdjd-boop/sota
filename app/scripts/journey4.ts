/**
 * Ещё три проверки по следам чтения меню:
 *  1) кофе — я просил КАЖДЫЙ день, но день 8 без него;
 *  2) белок — просил 1.8 г/кг, получил 1.68;
 *  3) фарш — отметил любимым, а он в одном блюде из 36.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { emptyPreferences, dishPreference, type Preferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';

const me: EaterProfile = {
  id: 'me', name: 'Я', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', proteinPerKg: 1.8,
  excludedProducts: [], dietTags: [],
};
function myPreferences(): Preferences {
  const p = emptyPreferences();
  p.products['mince'] = 'often';
  p.products['mince_chicken'] = 'often';
  p.products['pork'] = 'often';
  p.products['chicken_fillet'] = 'often';
  p.products['beef'] = 'often';
  p.products['greens'] = 'never';
  p.dishes['coffee_milk'] = 'always';
  return p;
}

export default async function main() {
  const menu = await planMenu(
    { budget: 15000, days: 30, eaters: [me], preferences: myPreferences() },
    RECIPES,
  );
  if (menu.status !== 'optimal') return console.log(menu.status);

  // 1) кофе по дням
  const coffee: number[] = [];
  for (const d of menu.schedule.days) {
    const has = d.meals.some((m) => m.dishes.some((x) => x.recipe.id === 'coffee_milk'));
    if (!has) coffee.push(d.index + 1);
  }
  console.log(`КОФЕ: дней без кофе — ${coffee.length}${coffee.length ? `: ${coffee.join(',')}` : ''}`);

  // 2) сколько блюд с фаршем вообще есть в базе и сколько доступно
  const minceRecipes = RECIPES.filter((r) =>
    r.ingredients.some((i) => i.productId === 'mince' || i.productId === 'mince_chicken'),
  );
  console.log(`\nФАРШ: блюд с фаршем в базе — ${minceRecipes.length}`);
  const prefs = myPreferences();
  for (const r of minceRecipes) {
    const inMenu = menu.demands.find((d) => d.stats.recipe.id === r.id);
    console.log(
      `   ${inMenu ? `×${String(inMenu.portions).padStart(2)}` : '  —'}  ${r.name.padEnd(34)} ` +
        `pref=${dishPreference(r, prefs).toFixed(2)} [${r.role}]`,
    );
  }

  // 3) белок: почему 1.68 вместо 1.8
  console.log(
    `\nБЕЛОК: ${(menu.actual.protein / 30).toFixed(0)} г/д = ` +
      `${(menu.actual.protein / 30 / 82).toFixed(2)} г/кг, просил 1.80 (${(82 * 1.8).toFixed(0)} г/д)`,
  );

  // источники белка
  const src = new Map<string, number>();
  for (const d of menu.schedule.days)
    for (const meal of d.meals)
      for (const dish of meal.dishes)
        for (const ing of dish.recipe.ingredients) {
          const p = PRODUCT_BY_ID[ing.productId];
          if (!p) continue;
          const g = ((p.per100g.protein * ing.grams) / 100) * dish.portions;
          if (g > 0) src.set(p.category, (src.get(p.category) ?? 0) + g);
        }
  const tot = [...src.values()].reduce((a, b) => a + b, 0);
  console.log('   откуда белок:');
  for (const [c, g] of [...src.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`     ${c.padEnd(10)} ${((g / tot) * 100).toFixed(0)}%`);
}
