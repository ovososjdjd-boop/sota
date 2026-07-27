/**
 * Ровно ли размазано «вкусное» по месяцу?
 *
 * Из прогона видно: день 1 — утиная грудка и стейк, дни 2-3 — фасоль
 * и картофельное пюре. Если деликатесы кучкуются в начале, человек
 * живёт «праздник, а потом будни» — а он живёт днём, как и сказано
 * в отзыве.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { classifyProduct } from '../src/core/tiers';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';

const e: EaterProfile = {
  id: 'u', name: 'Т', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', excludedProducts: [], dietTags: [],
};

export default async function main() {
  for (const budget of [18000, 35000]) {
    const m = await planMenu(
      { budget, days: 30, eaters: [e], preferences: emptyPreferences() },
      RECIPES,
    );
    if (m.status !== 'optimal') continue;
    const perDay = m.schedule.days.map((d) => {
      let treat = 0;
      let tot = 0;
      for (const meal of d.meals)
        for (const dish of meal.dishes)
          for (const ing of dish.recipe.ingredients) {
            const p = PRODUCT_BY_ID[ing.productId];
            if (!p) continue;
            const k = ((p.per100g.kcal * ing.grams) / 100) * dish.portions;
            tot += k;
            if (classifyProduct(p) === 'treat') treat += k;
          }
      return tot > 0 ? (treat / tot) * 100 : 0;
    });
    const kcal = m.schedule.days.map((d) => d.nutrients.kcal);
    console.log(`\n${budget} ₽, доля «вкусного» по дням (%):`);
    console.log('  ' + perDay.map((x) => x.toFixed(0).padStart(3)).join(''));
    console.log(`  дней вообще без вкусного: ${perDay.filter((x) => x < 1).length} из 30`);
    console.log(`  ккал по дням: ${kcal.map((x) => x.toFixed(0)).join(' ')}`);
    console.log(
      `  ккал: мин ${Math.min(...kcal).toFixed(0)} макс ${Math.max(...kcal).toFixed(0)} ` +
        `цель ${(m.target.kcal / 30).toFixed(0)}`,
    );
  }
}
