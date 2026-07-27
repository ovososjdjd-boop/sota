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
  const m = await planMenu({budget:15000,days:30,eaters:[me],preferences:prefs()},RECIPES);
  if (m.status!=='optimal') return;
  const d = m.demands.find(x=>x.stats.recipe.id==='coffee_milk');
  console.log('заказано порций кофе:', d?.portions ?? 0, 'daily=', d?.daily);
  let placed=0; const days:number[]=[];
  for (const day of m.schedule.days) for (const meal of day.meals) for (const dish of meal.dishes)
    if (dish.recipe.id==='coffee_milk') { placed+=dish.portions; days.push(day.index+1); }
  console.log('размещено порций:', placed, 'в днях:', days.join(','));
  const un = m.schedule.unplaced.find(u=>u.recipe.id==='coffee_milk');
  console.log('не размещено:', un?.portions ?? 0);
  // что стоит в перекусе дней 10 и 27
  for (const idx of [9,26]) {
    const day = m.schedule.days[idx];
    console.log(`день ${idx+1}:`, day.meals.map(mm=>`${mm.slot}[${mm.dishes.map(x=>x.recipe.name).join(', ')}]`).join(' '));
  }
}
