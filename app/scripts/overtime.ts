/**
 * Кто именно нарушает дневной лимит готовки?
 *
 * При лимите 90 мин попадаются дни по 116-120. Раскладка состоит
 * из нескольких проходов, и каждый добавляет время по-своему.
 * Ищем, какой именно и на сколько.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';

const e: EaterProfile = {
  id: 'u', name: 'Т', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', excludedProducts: [], dietTags: [],
};

export default async function main() {
  const LIM = 90;
  const m = await planMenu(
    { budget: 35000, days: 30, eaters: [e], preferences: emptyPreferences(), maxCookingMinutes: LIM },
    RECIPES,
  );
  if (m.status !== 'optimal') return;
  for (const d of m.schedule.days) {
    if (d.minutes <= LIM) continue;
    console.log(`\nДень ${d.index + 1}: ${d.minutes} мин (лимит ${LIM}, перебор ${d.minutes - LIM})`);
    for (const meal of d.meals)
      for (const dish of meal.dishes)
        console.log(
          `  ${meal.slot.padEnd(10)} ${dish.recipe.name.padEnd(34)} ` +
            `${String(dish.recipe.minutes).padStart(3)} мин  ${dish.cooked ? 'готовим' : 'разогрев'}`,
        );
  }
  const over = m.schedule.days.filter((d) => d.minutes > LIM);
  console.log(
    `\nИТОГО дней сверх лимита: ${over.length}/30, ` +
      `худший ${Math.max(...m.schedule.days.map((d) => d.minutes))} мин`,
  );
}
