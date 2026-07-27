/** Где теряются калории на сценарии теста: 7 дней, 6000 ₽, 1 взрослый. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const adult: EaterProfile = { id: 'a', name: 'В', sex: 'male', age: 35, heightCm: 178,
  weightKg: 78, activity: 'moderate', goal: 'maintain', excludedProducts: [], dietTags: [] };
export default async function main() {
  for (const budget of [6000, 9000, 15000]) {
    const m = await planMenu({ budget, days: 7, eaters: [adult], preferences: emptyPreferences() }, RECIPES);
    if (m.status !== 'optimal') { console.log(budget, m.status); continue; }
    const ordered = m.demands.reduce((s,d)=>s+d.stats.nutrients.kcal*d.portions,0);
    const placed = m.schedule.days.reduce((s,d)=>s+d.nutrients.kcal,0);
    const unpl = m.schedule.unplaced.reduce((s,u)=>s+u.portions,0);
    console.log(`${budget} ₽: цель ${Math.round(m.target.kcal)}  заказано ${Math.round(ordered)} (${(ordered/m.target.kcal*100).toFixed(0)}%)  ` +
      `на тарелке ${Math.round(placed)} (${(placed/m.target.kcal*100).toFixed(0)}%)  чек ${Math.round(m.purchaseCost)}  не размещено ${unpl}`);
  }
}
