/** Заказ против цели с предпочтениями и без. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const me = (ppk?: number): EaterProfile => ({ id:'me',name:'Я',sex:'male',age:32,heightCm:180,weightKg:82,
  activity:'sedentary',goal:'maintain',proteinPerKg:ppk,excludedProducts:[],dietTags:[] });
function prefs(on: boolean): Preferences {
  const p = emptyPreferences();
  if (on) { for (const id of ['mince','mince_chicken','pork','chicken_fillet','beef']) p.products[id]='often';
    p.products['greens']='never'; p.dishes['coffee_milk']='always'; }
  return p;
}
export default async function main() {
  for (const [ppk, on, name] of [[undefined,false,'без всего'],[1.8,false,'белок 1.8'],[undefined,true,'предпочтения'],[1.8,true,'белок+предпочтения']] as const) {
    const m = await planMenu({budget:15000,days:30,eaters:[me(ppk)],preferences:prefs(on)},RECIPES);
    if (m.status!=='optimal') { console.log(name, m.status); continue; }
    const ord = m.demands.reduce((s,d)=>s+d.stats.nutrients.kcal*d.portions,0);
    const pl = m.schedule.days.reduce((s,d)=>s+d.nutrients.kcal,0);
    const k = m.schedule.days.map(d=>d.nutrients.kcal);
    const low = k.filter(x=>x<m.target.kcal/30*0.85).length;
    console.log(`${name.padEnd(20)} заказ ${(ord/m.target.kcal*100).toFixed(0)}%  тарелка ${(pl/m.target.kcal*100).toFixed(0)}%  голодных дней ${low}  чек ${Math.round(m.purchaseCost)}`);
  }
}
