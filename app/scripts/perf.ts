/**
 * Время расчёта по сценариям. Приоритет — телефон: человек не будет
 * ждать больше 2-3 секунд, глядя на спиннер.
 *
 * Модель упаковок добавила сотни целых переменных, и это могло
 * дорого обойтись. Проверяем, а не предполагаем.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const cases: [string, number, number, number][] = [
    ['неделя, 1 чел', 7, 5000, 1],
    ['2 недели, 1 чел', 14, 9000, 1],
    ['месяц, 1 чел', 30, 15000, 1],
    ['месяц, семья 4', 30, 40000, 4],
    ['месяц, лимит 60 мин', 30, 15000, 1],
  ];
  for (const [name, days, budget, people] of cases) {
    const eaters = Array.from({ length: people }, (_, i) =>
      makeEaterLike({ id: `e${i}` }),
    );
    const t0 = Date.now();
    const m = await planMenu(
      {
        budget,
        days,
        eaters,
        preferences: emptyPreferences(),
        maxCookingMinutes: name.includes('лимит') ? 60 : undefined,
      },
      RECIPES,
    );
    const ms = Date.now() - t0;
    const flag = ms > 3000 ? '  ← МЕДЛЕННО' : '';
    console.log(
      `${name.padEnd(22)} ${String(ms).padStart(6)} мс  ${m.status}  ` +
        `ккал/д ${m.status === 'optimal' ? Math.round(m.actual.kcal / days / people) : '—'}${flag}`,
    );
  }
}
