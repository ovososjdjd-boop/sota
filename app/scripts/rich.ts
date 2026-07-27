/**
 * Глазами человека с большим бюджетом: что он реально видит?
 *
 * При 35 000 и 50 000 ₽ план получается одинаковый — приложение
 * упирается в потолок базы. Это нормально (еды на 50 000 ₽ в месяц
 * один человек не съест), но человек должен ПОНИМАТЬ, почему,
 * а не гадать, сломалось ли приложение.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { MODE_LABEL } from '../src/core/tiers';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';

const e: EaterProfile = {
  id: 'u', name: 'Т', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', excludedProducts: [], dietTags: [],
};

export default async function main() {
  for (const budget of [35000, 50000]) {
    const m = await planMenu(
      { budget, days: 30, eaters: [e], preferences: emptyPreferences() },
      RECIPES,
    );
    if (m.status !== 'optimal') {
      console.log(budget, m.status);
      continue;
    }
    console.log(
      `\n═══ ${budget} ₽ на месяц — режим «${MODE_LABEL[m.mode]}» ═══\n` +
        `чек ${Math.round(m.purchaseCost)} ₽, остаётся ${Math.round(budget - m.purchaseCost)} ₽`,
    );
    console.log('\nЧТО ГОВОРИТ ПРИЛОЖЕНИЕ:');
    for (const x of m.explanations) console.log(`  [${x.kind}] ${x.text}`);
    console.log('\nПЕРВЫЕ ТРИ ДНЯ:');
    for (const d of m.schedule.days.slice(0, 3)) {
      console.log(`  День ${d.index + 1} — ${d.nutrients.kcal.toFixed(0)} ккал`);
      for (const meal of d.meals)
        if (meal.dishes.length)
          console.log(
            `    ${meal.slot.padEnd(10)} ${meal.dishes.map((x) => x.recipe.name).join(', ')}`,
          );
    }
  }
}
