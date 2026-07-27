/** Какие ограничения упираются при большом бюджете. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { periodTargets } from '../src/core/nutrition';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';
const e: EaterProfile = { id:'u',name:'Т',sex:'male',age:32,heightCm:180,weightKg:82,
  activity:'sedentary',goal:'maintain',excludedProducts:[],dietTags:[] };
export default async function main() {
  const m = await planMenu({budget:35000,days:30,eaters:[e],preferences:emptyPreferences()},RECIPES);
  if (m.status!=='optimal') return;
  const t = periodTargets([e],30);
  const ord = { kcal:0, protein:0, fat:0, carbs:0 };
  for (const d of m.demands) { ord.kcal+=d.stats.nutrients.kcal*d.portions; ord.protein+=d.stats.nutrients.protein*d.portions;
    ord.fat+=d.stats.nutrients.fat*d.portions; ord.carbs+=d.stats.nutrients.carbs*d.portions; }
  for (const k of ['kcal','protein','fat','carbs'] as const) {
    const hi=t[k].max*1.25;
    console.log(`${k.padEnd(8)} ${ord[k].toFixed(0).padStart(6)} / потолок ${hi.toFixed(0)} = ${(ord[k]/hi*100).toFixed(0)}%`);
  }
  // категории
  const byCat = new Map<string,number>(); let tot=0;
  for (const d of m.demands) for (const [c,k] of Object.entries(d.stats.categoryKcal)) {
    byCat.set(c,(byCat.get(c)??0)+(k as number)*d.portions); tot+=(k as number)*d.portions; }
  console.log('\nдоли категорий:');
  for (const [c,k] of [...byCat.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6))
    console.log(`  ${c.padEnd(10)} ${(k/tot*100).toFixed(1)}%`);
  // творог
  let curd=0; for (const d of m.demands) for (const i of d.stats.recipe.ingredients)
    if (i.productId.startsWith('cottage')) curd += i.grams*d.portions;
  console.log(`\nтворог ${Math.round(curd)} г за месяц (потолок ${60*30} г)`);
}
