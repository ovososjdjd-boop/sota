/** Чего не хватает базе: быстрых, калорийных, белковых основ. */
import { RECIPES } from '../src/data/recipes';
import { computeRecipeStats } from '../src/core/recipes';
export default function () {
  const core = RECIPES.filter(r => ['main','soup','porridge'].includes(r.role));
  const fast = core.filter(r => r.minutes <= 25);
  console.log(`основ всего ${core.length}, быстрых (≤25 мин) ${fast.length}`);
  console.log('\nбыстрые основы:');
  for (const r of fast) {
    const s = computeRecipeStats(r);
    console.log(`  ${r.minutes} мин × ${r.batchPortions} порц, ${s.nutrients.kcal.toFixed(0)} ккал, Б ${s.nutrients.protein.toFixed(0)} — ${r.name} [${r.slots.join(',')}]`);
  }
  // сколько основ на завтрак
  for (const slot of ['breakfast','lunch','dinner']) {
    const n = core.filter(r => r.slots.includes(slot as never));
    const nf = n.filter(r => r.minutes <= 25);
    console.log(`${slot}: основ ${n.length}, из них быстрых ${nf.length}`);
  }
}
