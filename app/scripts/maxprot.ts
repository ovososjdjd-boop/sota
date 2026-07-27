/** Достижимо ли 1.8 г/кг вообще: пробуем разные запросы. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
function base(ppk: number): EaterProfile {
  return { id:'me',name:'Я',sex:'male',age:32,heightCm:180,weightKg:82,
    activity:'sedentary',goal:'maintain',proteinPerKg:ppk,excludedProducts:[],dietTags:[] };
}
function prefs(withLikes: boolean): Preferences {
  const p = emptyPreferences();
  if (withLikes) {
    for (const id of ['mince','mince_chicken','pork','chicken_fillet','beef']) p.products[id]='often';
    p.products['greens']='never'; p.dishes['coffee_milk']='always';
  }
  return p;
}
export default async function main() {
  for (const ppk of [1.4, 1.6, 1.8, 2.0]) {
    for (const likes of [false, true]) {
      const m = await planMenu({budget:15000,days:30,eaters:[base(ppk)],preferences:prefs(likes)},RECIPES);
      if (m.status!=='optimal') { console.log(`${ppk} likes=${likes}: ${m.status}`); continue; }
      console.log(`просил ${ppk}  ${likes?'с предпочтениями':'без предпочтений '}  → ${(m.actual.protein/30/82).toFixed(2)} г/кг  ккал/д ${(m.actual.kcal/30).toFixed(0)}  чек ${Math.round(m.purchaseCost)}`);
    }
  }
}
