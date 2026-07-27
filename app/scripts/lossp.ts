/** Заказ против тарелки: где теряется белок. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { periodTargets } from '../src/core/nutrition';
import type { EaterProfile } from '../src/core/types';
const me: EaterProfile = { id:'me',name:'Я',sex:'male',age:32,heightCm:180,weightKg:82,
  activity:'sedentary',goal:'maintain',proteinPerKg:1.8,excludedProducts:[],dietTags:[] };
function prefs(): Preferences {
  const p = emptyPreferences();
  for (const id of ['mince','mince_chicken','pork','chicken_fillet','beef']) p.products[id]='often';
  p.products['greens']='never'; p.dishes['coffee_milk']='always';
  return p;
}
export default async function main() {
  const m = await planMenu({budget:15000,days:30,eaters:[me],preferences:prefs()},RECIPES);
  if (m.status!=='optimal') return;
  const t = periodTargets([me],30);
  const ordP = m.demands.reduce((s,d)=>s+d.stats.nutrients.protein*d.portions,0);
  const ordK = m.demands.reduce((s,d)=>s+d.stats.nutrients.kcal*d.portions,0);
  console.log(`ЗАКАЗ:   белок ${ordP.toFixed(0)} (${(ordP/t.protein.target*100).toFixed(0)}% цели), ккал ${ordK.toFixed(0)}`);
  console.log(`ТАРЕЛКА: белок ${m.actual.protein.toFixed(0)} (${(m.actual.protein/t.protein.target*100).toFixed(0)}%), ккал ${m.actual.kcal.toFixed(0)}`);
  const un = m.schedule.unplaced.reduce((s,u)=>s+u.portions,0);
  const ord = m.demands.reduce((s,d)=>s+d.portions,0);
  console.log(`не размещено ${un} из ${ord} порций (${(un/ord*100).toFixed(0)}%)`);
  console.log('что не влезло:', m.schedule.unplaced.map(u=>`${u.recipe.name}×${u.portions}`).join(', '));
}
