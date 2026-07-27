/** Сколько treat-энергии несёт одна порция деликатеса против потолка. */
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { classifyProduct, MODE_PROFILES } from '../src/core/tiers';
import { periodTargets } from '../src/core/nutrition';
import { makeEaterLike } from './simProfile';
export default function () {
  const t = periodTargets([makeEaterLike()], 30);
  const cap = t.kcal.target * MODE_PROFILES.premium.maxTreatShare;
  console.log(`потолок treat за месяц: ${cap.toFixed(0)} ккал (30% от ${t.kcal.target.toFixed(0)})`);
  for (const r of RECIPES.filter(x=>x.tags.includes('delicacy'))) {
    let tk=0;
    for (const ing of r.ingredients) {
      const p=PRODUCT_BY_ID[ing.productId];
      if (p && classifyProduct(p)==='treat') tk += p.per100g.kcal*ing.grams/100;
    }
    console.log(`  ${r.name.padEnd(32)} treat ${tk.toFixed(0).padStart(4)} ккал/порц → максимум ${Math.floor(cap/Math.max(1,tk))} порций`);
  }
  // а сколько treat в обычных блюдах
  let total=0;
  for (const r of RECIPES) {
    let tk=0;
    for (const ing of r.ingredients) {
      const p=PRODUCT_BY_ID[ing.productId];
      if (p && classifyProduct(p)==='treat') tk += p.per100g.kcal*ing.grams/100;
    }
    if (tk>0) total++;
  }
  console.log(`\nблюд с любым treat: ${total} из ${RECIPES.length} — они конкурируют за тот же потолок`);
}
