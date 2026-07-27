/** Превышение лимита у профиля с привычкой «кофе каждый день». */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main(){
  const p: Preferences = emptyPreferences();
  for (const id of ['mince','pork','chicken_fillet']) p.products[id]='often';
  p.dishes['coffee_milk']='always';
  const m = await planMenu({budget:15000,days:30,eaters:[makeEaterLike()],preferences:p,maxCookingMinutes:90},RECIPES);
  if (m.status!=='optimal') return;
  for (const d of m.schedule.days) {
    if (d.minutes<=90) continue;
    console.log(`д${d.index+1}: ${d.minutes} мин (перебор ${d.minutes-90})`);
    for (const meal of d.meals) for (const dish of meal.dishes)
      if (dish.cooked) console.log(`   ${meal.slot.padEnd(10)} ${dish.recipe.name} ${dish.recipe.minutes}м${dish.recipe.tags.includes('dessert')?' [десерт]':''}`);
  }
  console.log(`дней сверх лимита: ${m.schedule.days.filter(d=>d.minutes>90).length}, худший ${Math.max(...m.schedule.days.map(d=>d.minutes))}`);
}
