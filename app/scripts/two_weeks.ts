import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  for (const mode of ['lean','balanced','premium',undefined] as const) {
    const m = await planMenu({budget:7000,days:14,eaters:[makeEaterLike()],preferences:emptyPreferences(),mode:mode as never},RECIPES);
    if (m.status!=='optimal') { console.log(mode, m.status); continue; }
    const ordered = m.demands.reduce((s,d)=>s+d.stats.nutrients.kcal*d.portions,0);
    const placed = m.schedule.days.reduce((s,d)=>s+d.nutrients.kcal,0);
    console.log(`${String(mode??'авто').padEnd(9)} ${m.mode.padEnd(9)} заказано ${(ordered/m.target.kcal*100).toFixed(0)}% на тарелке ${(placed/m.target.kcal*100).toFixed(0)}% чек ${Math.round(m.purchaseCost)}`);
  }
}
