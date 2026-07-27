/** Минимальный выполнимый бюджет по сценариям — не выросли ли пороги. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  for (const [days, budget] of [[7,3500],[7,5000],[30,5000],[30,9000],[30,12000],[14,7000]] as [number,number][]) {
    const m = await planMenu({ budget, days, eaters: [makeEaterLike()], preferences: emptyPreferences() }, RECIPES);
    const info = m.status === 'optimal'
      ? `OK чек ${Math.round(m.purchaseCost)} ₽ (${((m.purchaseCost/budget)*100).toFixed(0)}%), ккал/д ${(m.actual.kcal/days).toFixed(0)}`
      : `${m.status}${m.minimumFeasibleBudget ? `, минимум ${Math.round(m.minimumFeasibleBudget)} ₽` : ''}`;
    console.log(`${days} дн / ${budget} ₽ → ${info}`);
  }
}
