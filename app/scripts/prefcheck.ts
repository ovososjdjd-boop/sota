/** Меняет ли явное предпочтение по продукту долю мяса. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { emptyPreferences, dishPreference } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
function meatShare(m: Awaited<ReturnType<typeof planMenu>>) {
  let s=0,t=0;
  for (const d of m.schedule.days) for (const meal of d.meals) for (const dish of meal.dishes)
    for (const ing of dish.recipe.ingredients) {
      const p=PRODUCT_BY_ID[ing.productId]; if(!p) continue;
      const k=p.per100g.kcal*ing.grams/100*dish.portions; if(p.category==='meat') s+=k; t+=k;
    }
  return t?s/t*100:0;
}
export default async function main() {
  const base = emptyPreferences();
  const liked = emptyPreferences();
  for (const id of ['mince','chicken_fillet','pork','chicken_thigh','chicken_leg','beef'])
    liked.products[id]='often';
  for (const [name,prefs] of [['без предпочтений',base],['люблю мясо',liked]] as const) {
    const m = await planMenu({budget:15000,days:30,eaters:[makeEaterLike()],preferences:prefs},RECIPES);
    if (m.status!=='optimal') { console.log(name, m.status); continue; }
    console.log(`${name.padEnd(18)} мясо ${meatShare(m).toFixed(1)}%  блюд ${m.demands.length}`);
  }
  // сколько блюд вообще поднимается предпочтением
  let raised=0;
  for (const r of RECIPES) if (dishPreference(r, liked) > 1.05) raised++;
  console.log(`блюд, поднятых предпочтением: ${raised} из ${RECIPES.length}`);
}
