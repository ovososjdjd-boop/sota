/** Что мешает экономному режиму: недельный план на 5000 ₽. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  for (const mode of ['lean','balanced','premium',undefined] as const) {
    const m = await planMenu({budget:5000,days:7,eaters:[makeEaterLike()],preferences:emptyPreferences(),mode:mode as never},RECIPES);
    console.log(`режим ${String(mode??'авто').padEnd(9)} → ${m.status} ${m.status==='optimal'?`${m.mode} ккал/д ${(m.actual.kcal/7).toFixed(0)} чек ${Math.round(m.purchaseCost)} блюд ${m.demands.length}`:''}`);
  }
}
