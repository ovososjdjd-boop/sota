/**
 * Почему бюджет не тратится.
 *
 * Гипотеза: калории — потолок, и когда норма набрана, тратить больше
 * не на что. Единственный способ израсходовать деньги осмысленно —
 * заменить дешёвые калории дорогими: крупу на мясо, маргарин на масло.
 * Проверяем, упирается ли это в потолки категорий (мясо максимум 30%
 * энергии) или в целевую функцию (штраф за трату денег).
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { CATEGORY_RULES } from '../src/core/culinary';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  for (const budget of [8000, 15000, 25000, 40000]) {
    const m = await planMenu(
      { budget, days: 30, eaters: [makeEaterLike()], preferences: prefs },
      RECIPES,
    );
    if (m.status !== 'optimal') {
      console.log(budget, m.status);
      continue;
    }
    // доли категорий в энергии
    const byCat = new Map<string, number>();
    let total = 0;
    for (const day of m.schedule.days)
      for (const meal of day.meals)
        for (const dish of meal.dishes)
          for (const [cat, k] of Object.entries(dish.stats.categoryKcal)) {
            byCat.set(cat, (byCat.get(cat) ?? 0) + (k as number) * dish.portions);
            total += (k as number) * dish.portions;
          }

    const meat = ((byCat.get('meat') ?? 0) / total) * 100;
    const fish = ((byCat.get('fish') ?? 0) / total) * 100;
    const meatCap = (CATEGORY_RULES.meat?.maxEnergyShare ?? 0) * 100;
    const fishCap = (CATEGORY_RULES.fish?.maxEnergyShare ?? 0) * 100;

    const protPerKg = m.actual.protein / 30 / 82;
    console.log(
      `бюджет ${String(budget).padStart(5)}  чек ${String(Math.round(m.purchaseCost)).padStart(5)} ` +
        `(${((m.purchaseCost / budget) * 100).toFixed(0)}%)  ккал/д ${(m.actual.kcal / 30).toFixed(0)}  ` +
        `белок ${protPerKg.toFixed(2)} г/кг  мясо ${meat.toFixed(1)}%/${meatCap}  ` +
        `рыба ${fish.toFixed(1)}%/${fishCap}  блюд ${m.demands.length}`,
    );
  }
}
