/** Попадают ли десерты в меню и как часто. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
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
  const desserts = RECIPES.filter(r=>r.tags.includes('dessert'));
  console.log(`десертов в базе: ${desserts.length}`);
  const m = await planMenu({budget:15000,days:30,eaters:[me],preferences:prefs()},RECIPES);
  if (m.status!=='optimal') return console.log(m.status);
  let total=0; const days:number[]=[];
  for (const d of m.schedule.days) for (const meal of d.meals) for (const dish of meal.dishes)
    if (dish.recipe.tags.includes('dessert')) { total+=dish.portions; days.push(d.index+1); }
  console.log(`подач десертов: ${total}, в днях: ${days.join(',') || 'НЕТ'}`);
  for (const r of desserts) {
    const inM = m.demands.find(d=>d.stats.recipe.id===r.id);
    console.log(`   ${inM?`×${inM.portions}`:'  —'} ${r.name}`);
  }
}
