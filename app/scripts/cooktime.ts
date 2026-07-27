/**
 * Сколько времени отнимает меню, если лимит НЕ задан.
 *
 * По умолчанию maxCookingMinutes не установлен, и прогон показал
 * 126 минут в день — два часа у плиты. Для работающего человека
 * это столько же нереально, как 233 минуты из первого отзыва.
 * Отсутствие настройки не должно означать «время бесконечно».
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  for (const [days, budget] of [
    [7, 5000],
    [14, 8000],
    [30, 15000],
  ] as [number, number][]) {
    const m = await planMenu(
      { budget, days, eaters: [makeEaterLike()], preferences: emptyPreferences() },
      RECIPES,
    );
    if (m.status !== 'optimal') {
      console.log(days, m.status);
      continue;
    }
    const perDay = m.schedule.days.map((d) => d.minutes);
    const avg = perDay.reduce((a, b) => a + b, 0) / days;
    const worst = Math.max(...perDay);
    const over90 = perDay.filter((x) => x > 90).length;
    console.log(
      `${String(days).padStart(2)} дн: ${avg.toFixed(0)} мин/д в среднем, ` +
        `худший день ${worst}, дней дольше 1.5 ч: ${over90} из ${days}`,
    );
  }
}
