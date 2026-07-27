/**
 * Почему раскладка отказывает блюдам при лимите времени.
 *
 * Считаем, какое именно правило чаще всего блокирует размещение.
 * Без этого любая правка — гадание: раньше уже дважды «чинили»
 * не ту причину.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const m = await planMenu(
    {
      budget: 15000,
      days: 30,
      eaters: [makeEaterLike()],
      preferences: emptyPreferences(),
      maxCookingMinutes: 60,
    },
    RECIPES,
  );
  if (m.status !== 'optimal') return console.log(m.status);

  // Сколько времени реально занято и сколько свободно
  let usedTotal = 0;
  let freeDays = 0;
  const gaps: number[] = [];
  for (const d of m.schedule.days) {
    usedTotal += d.minutes;
    const free = 60 - d.minutes;
    gaps.push(free);
    if (free > 20) freeDays++;
  }
  console.log(
    `время: занято ${usedTotal} из ${60 * 30} мин (${((usedTotal / 1800) * 100).toFixed(0)}%), ` +
      `дней со свободой >20 мин: ${freeDays}`,
  );
  console.log(`свободные минуты по дням: ${gaps.join(' ')}`);

  // Что не разложилось и сколько времени требует
  const un = m.schedule.unplaced
    .map((u) => ({
      name: u.recipe.name,
      portions: u.portions,
      minutes: u.recipe.minutes,
      keeps: u.recipe.keepsDays,
      batch: u.recipe.batchPortions,
      slots: u.recipe.slots.join(','),
      role: u.recipe.role,
    }))
    .sort((a, b) => b.portions - a.portions);
  console.log('\nне размещено:');
  for (const u of un.slice(0, 15)) {
    console.log(
      `  ×${String(u.portions).padStart(2)} ${u.name.padEnd(32)} ${String(u.minutes).padStart(3)} мин, ` +
        `хранится ${u.keeps} дн, партия ${u.batch} [${u.role}/${u.slots}]`,
    );
  }

  // Насколько заполнены приёмы
  const bySlot = new Map<string, { got: number; target: number; empty: number }>();
  for (const d of m.schedule.days)
    for (const meal of d.meals) {
      const cur = bySlot.get(meal.slot) ?? { got: 0, target: 0, empty: 0 };
      cur.got += meal.nutrients.kcal;
      cur.target += meal.targetKcal;
      if (meal.dishes.length === 0) cur.empty++;
      bySlot.set(meal.slot, cur);
    }
  console.log('\nзаполненность приёмов:');
  for (const [slot, v] of bySlot) {
    console.log(
      `  ${slot.padEnd(10)} ${Math.round(v.got)} из ${Math.round(v.target)} ккал ` +
        `(${((v.got / v.target) * 100).toFixed(0)}%), пустых ${v.empty}`,
    );
  }
}
