/**
 * Почему при богатом бюджете калорийность просела до 2300 при цели 2506?
 *
 * Гипотеза: узкое место — не деньги, а ВРЕМЯ. Деликатесы дорогие
 * по готовке (30-35 мин, batchPortions 2, keepsDays 1), готовка
 * уже 85 мин при лимите 90. Структура требует мяса и рыбы, они
 * требуют готовки, время кончается — и еда вытесняется.
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
  for (const budget of [18000, 35000]) {
    for (const lim of [90, 120, 0]) {
      const m = await planMenu(
        {
          budget, days: 30, eaters: [e],
          preferences: emptyPreferences(),
          maxCookingMinutes: lim,
        },
        RECIPES,
      );
      if (m.status !== 'optimal') {
        console.log(budget, lim, m.status);
        continue;
      }
      const kcal = m.schedule.days.map((d) => d.nutrients.kcal);
      const mins = m.schedule.days.map((d) => d.minutes);
      const ordK = m.demands.reduce((s, d) => s + d.stats.nutrients.kcal * d.portions, 0);
      const unpl = m.schedule.unplaced.reduce((s, u) => s + u.portions, 0);
      console.log(
        `${budget} ₽ лимит ${String(lim || '—').padStart(3)}: ` +
          `заказ ${((ordK / m.target.kcal) * 100).toFixed(0)}% ` +
          `тарелка ${((kcal.reduce((a, b) => a + b, 0) / m.target.kcal) * 100).toFixed(0)}% ` +
          `ккал/д ${(kcal.reduce((a, b) => a + b, 0) / 30).toFixed(0)} ` +
          `готовка ${(mins.reduce((a, b) => a + b, 0) / 30).toFixed(0)} мин/д ` +
          `(макс ${Math.max(...mins)}) потери ${unpl} чек ${Math.round(m.purchaseCost)}`,
      );
    }
    console.log('');
  }
}
