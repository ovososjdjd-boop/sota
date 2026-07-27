/** Доходят ли деликатесы до MILP и почему не выбираются. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { computeRecipeStats } from '../src/core/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  const del = RECIPES.filter(r=>r.tags.includes('delicacy'));
  console.log('деликатесы в базе:');
  for (const r of del) {
    const s = computeRecipeStats(r);
    console.log(`  ${r.name.padEnd(32)} ${s.cost.toFixed(0).padStart(4)} ₽  ${s.nutrients.kcal.toFixed(0)} ккал  Б${s.nutrients.protein.toFixed(0)}  [${r.role}/${r.slots.join(',')}] req=${r.requires??'-'}`);
  }
  const m = await planMenu({budget:35000,days:30,eaters:[makeEaterLike()],preferences:emptyPreferences(),mode:'premium'},RECIPES);
  if (m.status!=='optimal') return console.log(m.status);
  const used = new Map(m.demands.map(d=>[d.stats.recipe.id,d.portions]));
  console.log('\nв заказе:');
  for (const r of del) console.log(`  ${r.name.padEnd(32)} ${used.get(r.id) ?? 0} порций`);
  console.log(`\nвсего блюд в заказе ${m.demands.length}, чек ${Math.round(m.purchaseCost)}`);
}
