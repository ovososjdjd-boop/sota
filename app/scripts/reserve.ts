/** Сводка качества по бюджетам. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const e: EaterProfile = { id:'u',name:'Т',sex:'male',age:32,heightCm:180,weightKg:82,
  activity:'sedentary',goal:'maintain',excludedProducts:[],dietTags:[] };
export default async function main(){
  for (const b of [11000, 18000, 35000]) {
    const m = await planMenu({budget:b,days:30,eaters:[e],preferences:emptyPreferences()},RECIPES);
    if (m.status!=='optimal') { console.log(b,m.status); continue; }
    const t=m.target.kcal/30, k=m.schedule.days.map(d=>d.nutrients.kcal), mins=m.schedule.days.map(d=>d.minutes);
    let empty=0, over=0;
    for (const d of m.schedule.days) for (const meal of d.meals) {
      if (meal.dishes.length===0 && meal.slot!=='snack') empty++;
      if (meal.nutrients.kcal > meal.targetKcal*1.5) over++;
    }
    console.log(`${b} ₽: ккал/д ${(k.reduce((a,x)=>a+x,0)/30).toFixed(0)} голодных ${k.filter(x=>x<t*0.8).length} `+
      `разброс ${Math.min(...k).toFixed(0)}-${Math.max(...k).toFixed(0)} готовка ${(mins.reduce((a,x)=>a+x,0)/30).toFixed(0)} макс ${Math.max(...mins)} `+
      `пустых ${empty} раздутых ${over} потери ${m.schedule.unplaced.reduce((s,u)=>s+u.portions,0)} чек ${Math.round(m.purchaseCost)}`);
  }
}
