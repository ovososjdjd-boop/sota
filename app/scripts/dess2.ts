/** Десерты без предпочтений — сценарий теста-стража. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const eater: EaterProfile = { id:'me',name:'Я',sex:'male',age:32,heightCm:180,weightKg:82,
  activity:'sedentary',goal:'maintain',excludedProducts:[],dietTags:[] };
export default async function main(){
  const m = await planMenu({budget:15000,days:30,eaters:[eater],preferences:emptyPreferences()},RECIPES);
  console.log('статус',m.status,'режим',m.mode);
  const ordered = m.demands.filter(d=>d.stats.recipe.tags.includes('dessert'));
  console.log('ЗАКАЗАНО десертов:', ordered.map(d=>`${d.stats.recipe.name}×${d.portions}`).join(', ')||'НЕТ');
  let placed=0; const where:string[]=[];
  for (const d of m.schedule.days) for (const meal of d.meals) for (const dish of meal.dishes)
    if (dish.recipe.tags.includes('dessert')) { placed+=dish.portions; where.push(`д${d.index+1}/${meal.slot}`); }
  console.log('РАЗМЕЩЕНО:', placed, where.join(' '));
  console.log('не влезло:', m.schedule.unplaced.map(u=>`${u.recipe.name}×${u.portions}`).join(', ')||'—');
}
