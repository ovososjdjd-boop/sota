/** Что мешает набрать 1.8 г/кг: смотрим все макросы против границ. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { periodTargets, dailyTargets } from '../src/core/nutrition';
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
  const dt = dailyTargets(me);
  console.log('ЦЕЛИ В ДЕНЬ:');
  for (const k of ['kcal','protein','fat','carbs'] as const)
    console.log(`  ${k.padEnd(8)} min ${dt[k].min.toFixed(0).padStart(5)}  target ${dt[k].target.toFixed(0).padStart(5)}  max ${dt[k].max.toFixed(0).padStart(5)}`);
  const m = await planMenu({budget:15000,days:30,eaters:[me],preferences:prefs()},RECIPES);
  if (m.status!=='optimal') return;
  const t = periodTargets([me],30);
  console.log('\nФАКТ ЗА ПЕРИОД (заказ):');
  const ord = { kcal:0, protein:0, fat:0, carbs:0 };
  for (const d of m.demands) { ord.kcal+=d.stats.nutrients.kcal*d.portions; ord.protein+=d.stats.nutrients.protein*d.portions;
    ord.fat+=d.stats.nutrients.fat*d.portions; ord.carbs+=d.stats.nutrients.carbs*d.portions; }
  for (const k of ['kcal','protein','fat','carbs'] as const) {
    const hi = t[k].max*1.25, lo = t[k].min*(k==='protein'?0.97:0.75);
    const v = ord[k];
    const flag = v>=hi*0.98 ? ' ← УПЁРЛОСЬ В ПОТОЛОК' : v<=lo*1.02 ? ' ← НА НИЖНЕЙ ГРАНИЦЕ' : '';
    console.log(`  ${k.padEnd(8)} ${v.toFixed(0).padStart(6)}  рельсы [${lo.toFixed(0)}..${hi.toFixed(0)}]${flag}`);
  }
}
