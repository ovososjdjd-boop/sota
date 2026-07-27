/** Сколько творожных блюд и почему белок не дотягивает до 1.8. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
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
  if (m.status!=='optimal') return console.log(m.status);
  const t = periodTargets([me],30);
  console.log(`белок ${m.actual.protein.toFixed(0)} при target ${t.protein.target.toFixed(0)}, min ${t.protein.min.toFixed(0)}, max ${t.protein.max.toFixed(0)}`);
  console.log(`ккал ${m.actual.kcal.toFixed(0)} при target ${t.kcal.target.toFixed(0)}`);
  // творожные блюда
  let curdPortions = 0;
  const curdDishes = new Map<string,number>();
  for (const d of m.schedule.days) for (const meal of d.meals) for (const dish of meal.dishes) {
    const g = dish.recipe.ingredients.filter(i=>['cottage_cheese','cottage_cheese_9','cottage_cheese_grainy'].includes(i.productId)).reduce((s,i)=>s+i.grams,0);
    if (g>=50) { curdPortions += dish.portions; curdDishes.set(dish.recipe.name,(curdDishes.get(dish.recipe.name)??0)+1); }
  }
  console.log(`\nтворожных подач: ${curdPortions}`);
  for (const [n,c] of [...curdDishes.entries()].sort((a,b)=>b[1]-a[1])) console.log(`   ${c}× ${n}`);
  // молочные подачи вообще
  let dairyServ = 0;
  for (const d of m.schedule.days) for (const meal of d.meals) for (const dish of meal.dishes) {
    const g = dish.recipe.ingredients.filter(i=>PRODUCT_BY_ID[i.productId]?.category==='dairy').reduce((s,i)=>s+i.grams,0);
    if (g>=80) dairyServ++;
  }
  console.log(`\nподач с заметной молочкой: ${dairyServ} из ${m.schedule.days.reduce((s,d)=>s+d.meals.reduce((a,x)=>a+x.dishes.length,0),0)}`);
}
