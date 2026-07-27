/** Тестовый сценарий: 6000 ₽ на неделю — где теряются калории. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const adult: EaterProfile = { id:'a',name:'В',sex:'male',age:35,heightCm:178,weightKg:78,
  activity:'moderate',goal:'maintain',excludedProducts:[],dietTags:[] };
export default async function main() {
  const m = await planMenu({budget:6000,days:7,eaters:[adult],preferences:emptyPreferences()},RECIPES);
  if (m.status!=='optimal') return console.log(m.status);
  const ord = m.demands.reduce((s,d)=>s+d.stats.nutrients.kcal*d.portions,0);
  const pl = m.schedule.days.reduce((s,d)=>s+d.nutrients.kcal,0);
  console.log(`цель ${m.target.kcal.toFixed(0)}  заказ ${ord.toFixed(0)} (${(ord/m.target.kcal*100).toFixed(0)}%)  тарелка ${pl.toFixed(0)} (${(pl/m.target.kcal*100).toFixed(0)}%)`);
  console.log('по дням:', m.schedule.days.map(d=>Math.round(d.nutrients.kcal)).join(' '));
  const un = m.schedule.unplaced.reduce((s,u)=>s+u.portions,0);
  console.log(`не размещено ${un} порций:`, m.schedule.unplaced.map(u=>`${u.recipe.name}×${u.portions}`).join(', '));
}
