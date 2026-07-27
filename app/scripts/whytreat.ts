/** Почему «вкусное» не попадает в меню даже при большом бюджете. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { computeRecipeStats } from '../src/core/recipes';
import { classifyProduct } from '../src/core/tiers';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  // сколько блюд вообще содержат treat-продукты
  let withTreat = 0;
  const list: string[] = [];
  for (const r of RECIPES) {
    const st = computeRecipeStats(r);
    let tk = 0;
    for (const ing of r.ingredients) {
      const p = PRODUCT_BY_ID[ing.productId];
      if (p && classifyProduct(p) === 'treat') tk += p.per100g.kcal*ing.grams/100;
    }
    if (tk > st.nutrients.kcal*0.15) { withTreat++; list.push(`${r.name} ${(tk/st.nutrients.kcal*100).toFixed(0)}%`); }
  }
  console.log(`блюд с заметной долей «вкусного»: ${withTreat} из ${RECIPES.length}`);
  console.log(list.slice(0,20).join('; '));

  const m = await planMenu({ budget: 35000, days: 30, eaters:[makeEaterLike()], preferences: emptyPreferences() }, RECIPES);
  if (m.status==='optimal') {
    const used = new Set(m.demands.map(d=>d.stats.recipe.id));
    const del = RECIPES.filter(r=>r.tags.includes('delicacy'));
    console.log(`\nделикатесных блюд в базе ${del.length}, попало в меню ${del.filter(r=>used.has(r.id)).length}`);
    console.log('в меню:', del.filter(r=>used.has(r.id)).map(r=>r.name).join(', ') || '—');
  }
}
