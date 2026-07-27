/** Из чего состоит первый поход: запас вперёд или потребность недели. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { planWaves } from '../src/core/waves';
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
  const w = planWaves(m.schedule)[0];
  const sorted = [...w.lines].sort((a,b)=>b.cost-a.cost);
  console.log(`поход 1: ${Math.round(w.cost)} ₽, ${w.lines.length} позиций\n`);
  let carry=0, need=0;
  for (const l of sorted.slice(0,18)) {
    const useNow = l.neededGrams;
    const bought = l.buyGrams;
    const ahead = Math.max(0, bought - useNow);
    console.log(`  ${l.product.name.padEnd(30)} ${Math.round(l.cost).toString().padStart(4)} ₽  нужно ${Math.round(useNow)}г, куплено ${Math.round(bought)}г, впрок ${Math.round(ahead)}г`);
  }
  for (const l of w.lines) { need += (l.neededGrams/1000)*l.product.pricePerKg; carry += l.cost; }
  console.log(`\nнужно на неделю по нетто: ${Math.round(need)} ₽, куплено на ${Math.round(carry)} ₽`);
}
