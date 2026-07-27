/**
 * ПОТОЛОК ТРАТ: сколько денег физически можно потратить на здоровый
 * рацион из нашей базы?
 *
 * Вопрос принципиальный. Приложение ругают за то, что при 35 000 ₽
 * на месяц оно тратит 15 000. Но человек ест 2450 ккал в день, а не
 * «на 35 000 рублей». Прежде чем крутить веса, надо понять: это
 * жадность алгоритма или физический предел базы продуктов.
 *
 * Считаем цену 1000 ккал у каждого блюда и строим ГИПОТЕТИЧЕСКИ САМЫЙ
 * ДОРОГОЙ рацион, соблюдающий доли классов (treat ≤ 30% энергии и т.д.).
 */
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { computeRecipeStats } from '../src/core/recipes';
import { classifyProduct, MODE_PROFILES, type ProductTier } from '../src/core/tiers';

export default async function main() {
  const rows = RECIPES.map((r) => {
    const s = computeRecipeStats(r, PRODUCT_BY_ID);
    if (!s.valid || s.nutrients.kcal <= 0) return null;
    // класс блюда — по классу продукта, дающего больше всего энергии
    const byTier = new Map<ProductTier, number>();
    for (const ing of r.ingredients) {
      const p = PRODUCT_BY_ID[ing.productId];
      if (!p) continue;
      const k = (p.per100g.kcal * ing.grams) / 100;
      const t = classifyProduct(p);
      byTier.set(t, (byTier.get(t) ?? 0) + k);
    }
    const tier = [...byTier.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'essential';
    return {
      name: r.name,
      role: r.role,
      tier,
      kcal: s.nutrients.kcal,
      cost: s.cost,
      per1000: (s.cost / s.nutrients.kcal) * 1000,
      delicacy: r.tags.includes('delicacy'),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  rows.sort((a, b) => b.per1000 - a.per1000);
  console.log('САМЫЕ ДОРОГИЕ БЛЮДА (₽ за 1000 ккал):');
  for (const r of rows.slice(0, 15))
    console.log(
      `  ${r.per1000.toFixed(0).padStart(4)} ₽/1000ккал  ${r.name.padEnd(34)} ` +
        `${r.role.padEnd(8)} ${r.tier}${r.delicacy ? ' *деликатес' : ''}`,
    );

  console.log('\nСАМЫЕ ДЕШЁВЫЕ:');
  for (const r of rows.slice(-8))
    console.log(`  ${r.per1000.toFixed(0).padStart(4)} ₽/1000ккал  ${r.name}`);

  // медианы по классам
  const med = (list: number[]) =>
    list.length ? list.sort((a, b) => a - b)[Math.floor(list.length / 2)] : 0;
  console.log('\nМЕДИАНА ₽/1000 ккал по классу блюда:');
  for (const t of ['staple', 'essential', 'treat', 'indulgence'] as ProductTier[]) {
    const l = rows.filter((r) => r.tier === t).map((r) => r.per1000);
    console.log(`  ${t.padEnd(12)} ${med(l).toFixed(0)} ₽   блюд ${l.length}`);
  }

  // потолок для месяца одного человека: 73 500 ккал
  const KCAL = 2450 * 30;
  const p = MODE_PROFILES.premium;
  const topTreat = med(rows.filter((r) => r.tier === 'treat').map((r) => r.per1000));
  const maxTreat = rows.filter((r) => r.tier === 'treat').map((r) => r.per1000).sort((a, b) => b - a)[0] ?? 0;
  const essential = med(rows.filter((r) => r.tier === 'essential').map((r) => r.per1000));
  const bestEssential =
    rows.filter((r) => r.tier === 'essential').map((r) => r.per1000).sort((a, b) => b - a)[0] ?? 0;

  const realistic =
    ((KCAL * p.maxTreatShare) / 1000) * topTreat +
    ((KCAL * (1 - p.maxTreatShare)) / 1000) * essential;
  const optimistic =
    ((KCAL * p.maxTreatShare) / 1000) * maxTreat +
    ((KCAL * (1 - p.maxTreatShare)) / 1000) * bestEssential;

  console.log(
    `\nПОТОЛОК месяца (нетто, без переплаты за упаковки):\n` +
      `  разумно дорогой рацион  ≈ ${Math.round(realistic)} ₽\n` +
      `  предельно дорогой       ≈ ${Math.round(optimistic)} ₽ (все 30% энергии — самый дорогой деликатес)`,
  );
}
