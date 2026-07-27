/**
 * Время: модель считает СРЕДНИМ, раскладка укладывает ПО ДНЯМ.
 *
 * Ограничение в MILP одно на весь период: сумма минут ≤ лимит × дни.
 * Раскладка же решает задачу упаковки: каждый день отдельно, и блюда
 * неделимы. Средняя загрузка 85 из 90 минут выглядит выполнимой,
 * а на деле худший день доходит до 115, порции не помещаются
 * и еда теряется — 8% калорий.
 *
 * Проверяем: если оставить модели запас на упаковку, вырастет ли
 * доля еды, реально попавшей на тарелку?
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
  // запас эмулируем через сам лимит: модель и раскладка получают разное
  // значение нельзя задать снаружи, поэтому смотрим отклик на лимит
  for (const budget of [11000, 18000, 35000]) {
    for (const lim of [90, 100, 110, 120]) {
      const m = await planMenu(
        { budget, days: 30, eaters: [e], preferences: emptyPreferences(), maxCookingMinutes: lim },
        RECIPES,
      );
      if (m.status !== 'optimal') { console.log(budget, lim, m.status); continue; }
      const mins = m.schedule.days.map((d) => d.minutes);
      const over = mins.filter((x) => x > lim).length;
      const kcal = m.schedule.days.reduce((s, d) => s + d.nutrients.kcal, 0);
      console.log(
        `${budget} ₽ лимит ${lim}: тарелка ${((kcal / m.target.kcal) * 100).toFixed(0)}% ` +
          `готовка ${(mins.reduce((a, b) => a + b, 0) / 30).toFixed(0)} мин/д ` +
          `дней сверх лимита ${over} (макс ${Math.max(...mins)}) ` +
          `потери ${m.schedule.unplaced.reduce((s, u) => s + u.portions, 0)}`,
      );
    }
    console.log('');
  }
}
