import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { computeRecipeStats } from '../src/core/recipes';
import { detectMode } from '../src/core/tiers';
import { periodTargets } from '../src/core/nutrition';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  const e = makeEaterLike();
  const t = periodTargets([e], 30);
  const cheapest = Math.min(...RECIPES.map(r=>{const s=computeRecipeStats(r);return s.nutrients.kcal>0?s.cost/s.nutrients.kcal:1e9;}));
  const survival = cheapest * t.kcal.target;
  console.log(`самые дешёвые калории: ${(cheapest*1000).toFixed(1)} ₽/1000ккал`);
  console.log(`survivalCost за месяц: ${survival.toFixed(0)} ₽`);
  for (const b of [7000,11000,18000,35000,60000]) {
    console.log(`  ${b} ₽ → ratio ${(b/survival).toFixed(2)} → ${detectMode(b, survival)}`);
  }
  for (const [b,mode] of [[35000,'premium'],[35000,undefined]] as const) {
    const m = await planMenu({ budget:b, days:30, eaters:[e], preferences: emptyPreferences(), mode: mode as never }, RECIPES);
    console.log(`\nбюджет ${b}, режим задан=${mode??'авто'} → ${m.status} ${m.status==='optimal'?m.mode:''} чек ${m.status==='optimal'?Math.round(m.purchaseCost):'—'}`);
  }
}
