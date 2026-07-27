/** Подбор веса перебора калорий: неделя-тест против месяца-сценария. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const adult: EaterProfile = { id:'a',name:'В',sex:'male',age:35,heightCm:178,weightKg:78,
  activity:'moderate',goal:'maintain',excludedProducts:[],dietTags:[] };
const me: EaterProfile = { id:'me',name:'Я',sex:'male',age:32,heightCm:180,weightKg:82,
  activity:'sedentary',goal:'maintain',proteinPerKg:1.8,excludedProducts:[],dietTags:[] };
function prefs(): Preferences {
  const p = emptyPreferences();
  for (const id of ['mince','mince_chicken','pork','chicken_fillet','beef']) p.products[id]='often';
  p.products['greens']='never'; p.dishes['coffee_milk']='always';
  return p;
}
export default async function main() {
  for (const w of ['8','15','20','30']) {
    process.env.OW = w;
    const t = await planMenu({budget:6000,days:7,eaters:[adult],preferences:emptyPreferences()},RECIPES);
    const m = await planMenu({budget:15000,days:30,eaters:[me],preferences:prefs()},RECIPES);
    if (t.status!=='optimal'||m.status!=='optimal') { console.log(w,'fail'); continue; }
    const dev = Math.abs(t.deviation.kcal);
    const k = m.schedule.days.map(d=>d.nutrients.kcal);
    const low = k.filter(x=>x<2506*0.85).length, hi = k.filter(x=>x>2506*1.15).length;
    console.log(`вес ${w.padStart(2)}: тест-неделя откл ${dev.toFixed(1)}%  |  месяц: голодных ${low}, переедов ${hi}, ккал/д ${(m.actual.kcal/30).toFixed(0)}`);
  }
}
