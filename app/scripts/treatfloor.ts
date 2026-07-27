/**
 * Потолок «вкусного» разрешает 30% энергии, а по факту в меню 4%.
 * Проверяем: это солвер не хочет или физически не может?
 *
 * Опыт: превращаем потолок в ПОЛ (жёсткий минимум) и смотрим,
 * до какой доли задача остаётся выполнимой и что происходит с чеком.
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
  for (const budget of [18000, 25000, 35000, 50000]) {
    const m = await planMenu(
      { budget, days: 30, eaters: [e], preferences: emptyPreferences() },
      RECIPES,
    );
    if (m.status !== 'optimal') {
      console.log(budget, m.status);
      continue;
    }
    // сколько энергии из treat-продуктов
    let treat = 0;
    let tot = 0;
    const names = new Map<string, number>();
    for (const d of m.demands)
      for (const ing of d.stats.recipe.ingredients) {
        const p = PRODUCT_BY_ID[ing.productId];
        if (!p) continue;
        const k = ((p.per100g.kcal * ing.grams) / 100) * d.portions;
        tot += k;
        if (classifyProduct(p) === 'treat') {
          treat += k;
          names.set(p.name, (names.get(p.name) ?? 0) + ing.grams * d.portions);
        }
      }
    console.log(
      `\n${budget} ₽ → чек ${Math.round(m.purchaseCost)} (${((m.purchaseCost / budget) * 100).toFixed(0)}%) ` +
        `вкусное ${((treat / tot) * 100).toFixed(1)}% при потолке ${(
          m.mode === 'premium' ? 30 : m.mode === 'balanced' ? 15 : 5
        )}%`,
    );
    console.log(
      '   ' +
        [...names.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([n, g]) => `${n} ${Math.round(g)}г`)
          .join(', '),
    );
  }
}
