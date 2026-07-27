/**
 * Почему деликатесных блюд нет в меню при 35 000 ₽?
 *
 * Смотрим каждое из девяти: доходит ли до шорт-листа, что говорит
 * LP-релаксация, сколько порций даёт MILP.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { computeRecipeStats } from '../src/core/recipes';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';

const e: EaterProfile = {
  id: 'u', name: 'Т', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', excludedProducts: [], dietTags: [],
};

export default async function main() {
  const delicacies = RECIPES.filter((r) => r.tags.includes('delicacy'));
  console.log('ДЕЛИКАТЕСЫ БАЗЫ:');
  for (const r of delicacies) {
    const s = computeRecipeStats(r, PRODUCT_BY_ID);
    console.log(
      `  ${r.name.padEnd(30)} ${r.role.padEnd(6)} ${s.nutrients.kcal.toFixed(0)} ккал ` +
        `${s.cost.toFixed(0)} ₽  белок ${s.nutrients.protein.toFixed(0)} г  ` +
        `${((s.cost / s.nutrients.kcal) * 1000).toFixed(0)} ₽/1000ккал ` +
        `слоты ${r.slots.join(',')} требует ${(r.requires ?? []).join(',') || '—'}`,
    );
  }

  const m = await planMenu(
    { budget: 35000, days: 30, eaters: [e], preferences: emptyPreferences() },
    RECIPES,
  );
  if (m.status !== 'optimal') return;
  console.log(`\nв заказе (${m.demands.length} блюд), деликатесы:`);
  const got = m.demands.filter((d) => d.stats.recipe.tags.includes('delicacy'));
  console.log(got.length ? got.map((d) => `${d.stats.recipe.name} ×${d.portions}`).join(', ') : '  НЕТ НИ ОДНОГО');

  console.log('\nвесь заказ по убыванию порций:');
  for (const d of [...m.demands].sort((a, b) => b.portions - a.portions).slice(0, 20))
    console.log(
      `  ${String(d.portions).padStart(3)} × ${d.stats.recipe.name.padEnd(34)} ` +
        `${d.stats.cost.toFixed(0)} ₽/порц`,
    );

  // сколько всего энергии на порцию у деликатесов и сколько порций
  // нужно, чтобы набрать 30% энергии месяца
  const need = m.target.kcal * 0.3;
  for (const r of delicacies.slice(0, 3)) {
    const s = computeRecipeStats(r, PRODUCT_BY_ID);
    console.log(
      `\nчтобы дать 30% энергии (${need.toFixed(0)} ккал) одним «${r.name}» ` +
        `нужно ${(need / s.nutrients.kcal).toFixed(0)} порций, ` +
        `максимум по правилу неповторения ≈ ${Math.round(30 / 5)} подач`,
    );
  }
}
