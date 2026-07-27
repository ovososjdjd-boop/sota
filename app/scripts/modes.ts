/**
 * Главная проверка режимов: даёт ли бедный/средний/богатый рацион
 * РАЗНЫЙ и осмысленный результат.
 *
 * Что важно увидеть:
 *   - бедный: белок и овощи не проседают, мало «вкусного»,
 *     бюджет израсходован почти полностью;
 *   - средний: норма + немного интересного;
 *   - богатый: качество и разнообразие, деньги реально потрачены.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { classifyProduct, MODE_LABEL, type ProductTier } from '../src/core/tiers';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const days = 30;
  for (const budget of [7000, 11000, 18000, 35000]) {
    const m = await planMenu(
      { budget, days, eaters: [makeEaterLike()], preferences: emptyPreferences() },
      RECIPES,
    );
    if (m.status !== 'optimal') {
      console.log(`${budget} ₽ → ${m.status}`);
      continue;
    }

    // энергия по классам продуктов
    const byTier = new Map<ProductTier, number>();
    let total = 0;
    for (const day of m.schedule.days)
      for (const meal of day.meals)
        for (const dish of meal.dishes)
          for (const ing of dish.recipe.ingredients) {
            const pr = PRODUCT_BY_ID[ing.productId];
            if (!pr) continue;
            const k = ((pr.per100g.kcal * ing.grams) / 100) * dish.portions;
            const t = classifyProduct(pr);
            byTier.set(t, (byTier.get(t) ?? 0) + k);
            total += k;
          }
    const pct = (t: ProductTier) => (((byTier.get(t) ?? 0) / total) * 100).toFixed(1);

    // белок и овощи — то, что проседает при бедности
    const protein = m.actual.protein / days / 82;
    let produceG = 0;
    for (const day of m.schedule.days)
      for (const meal of day.meals)
        for (const dish of meal.dishes)
          produceG +=
            ((dish.stats.categoryGrams.vegetable ?? 0) +
              (dish.stats.categoryGrams.fruit ?? 0)) *
            dish.portions;

    console.log(
      `\n${String(budget).padStart(5)} ₽ → ${MODE_LABEL[m.mode].padEnd(16)} ` +
        `чек ${Math.round(m.purchaseCost)} (${((m.purchaseCost / budget) * 100).toFixed(0)}%)`,
    );
    console.log(
      `        ккал/д ${(m.actual.kcal / days).toFixed(0)}  белок ${protein.toFixed(2)} г/кг  ` +
        `овощи+фрукты ${(produceG / days).toFixed(0)} г/д  блюд ${m.demands.length}`,
    );
    console.log(
      `        основа ${pct('staple')}%  необходимое ${pct('essential')}%  ` +
        `вкусное ${pct('treat')}%  сладкое ${pct('indulgence')}%`,
    );
  }
}
