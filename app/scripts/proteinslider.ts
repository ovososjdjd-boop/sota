/** Работает ли ползунок белка: калории держатся, белок растёт. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  for (const ppk of [1.2, 1.5, 1.8, 2.0]) {
    const m = await planMenu(
      { budget: 15000, days: 30, eaters: [makeEaterLike({ proteinPerKg: ppk })],
        preferences: emptyPreferences() }, RECIPES);
    if (m.status !== 'optimal') { console.log(ppk, m.status); continue; }
    console.log(`просили ${ppk} г/кг → белок ${(m.actual.protein/30/82).toFixed(2)} г/кг ` +
      `(${(m.actual.protein/30).toFixed(0)} г/д), ккал/д ${(m.actual.kcal/30).toFixed(0)}, ` +
      `чек ${Math.round(m.purchaseCost)} ₽, блюд ${m.demands.length}`);
  }
}
