/** Что мешает тратить бюджет: заказ или раскладка. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const e: EaterProfile = { id:'u',name:'Т',sex:'male',age:32,heightCm:180,weightKg:82,
  activity:'sedentary',goal:'maintain',excludedProducts:[],dietTags:[] };
export default async function main() {
  for (const b of [12000, 18000, 35000]) {
    const m = await planMenu({budget:b,days:30,eaters:[e],preferences:emptyPreferences()},RECIPES);
    if (m.status!=='optimal') { console.log(b, m.status); continue; }
    const ordK = m.demands.reduce((s,d)=>s+d.stats.nutrients.kcal*d.portions,0);
    const ordC = m.demands.reduce((s,d)=>s+d.stats.cost*d.portions,0);
    const plK = m.schedule.days.reduce((s,d)=>s+d.nutrients.kcal,0);
    const unpl = m.schedule.unplaced.reduce((s,u)=>s+u.portions,0);
    const ordP = m.demands.reduce((s,d)=>s+d.portions,0);
    console.log(`${b} ₽: заказ ккал ${(ordK/m.target.kcal*100).toFixed(0)}% нетто ${Math.round(ordC)} ₽ | тарелка ${(plK/m.target.kcal*100).toFixed(0)}% чек ${Math.round(m.purchaseCost)} | потери ${unpl}/${ordP}`);
  }
}
