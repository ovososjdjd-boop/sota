/**
 * Почему еда не помещается в расписание.
 *
 * Гипотеза: фаза 1 заказывает блюда, не зная ВМЕСТИМОСТИ приёмов.
 * Напиток можно поставить только в перекус, а перекус — это 15% энергии.
 * Если заказать кефира, ряженки, йогурта и чая на 30% энергии,
 * половина физически некуда не влезет — но продукты уже куплены.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { MEAL_ENERGY_SHARE, type MealSlot } from '../src/core/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  prefs.products['pork'] = 'often';
  prefs.products['chicken_fillet'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  const days = 30;
  const menu = await planMenu(
    { budget: 15000, days, eaters: [makeEaterLike()], preferences: prefs },
    RECIPES,
  );
  if (menu.status !== 'optimal') return console.log(menu.status);

  const target = menu.target.kcal;

  // Сколько энергии заказано блюдами, которые годятся ТОЛЬКО в этот слот
  const exclusive = new Map<MealSlot, number>();
  const any = new Map<MealSlot, number>();
  for (const d of menu.demands) {
    const k = d.stats.nutrients.kcal * d.portions;
    const slots = d.stats.recipe.slots;
    if (slots.length === 1) exclusive.set(slots[0], (exclusive.get(slots[0]) ?? 0) + k);
    for (const s of slots) any.set(s, (any.get(s) ?? 0) + k);
  }

  console.log('слот        вместимость   заказано только-сюда   заказано вообще');
  for (const slot of ['breakfast', 'lunch', 'snack', 'dinner'] as MealSlot[]) {
    const cap = target * MEAL_ENERGY_SHARE[slot];
    const ex = exclusive.get(slot) ?? 0;
    const an = any.get(slot) ?? 0;
    const flag = ex > cap * 1.15 ? '  ← ПЕРЕЗАКАЗ' : '';
    console.log(
      `${slot.padEnd(11)} ${Math.round(cap).toString().padStart(7)}  ` +
        `${Math.round(ex).toString().padStart(14)} (${((ex / cap) * 100).toFixed(0)}%)  ` +
        `${Math.round(an).toString().padStart(12)}${flag}`,
    );
  }

  // фактическая заполненность слотов в расписании
  const got = new Map<MealSlot, number>();
  for (const day of menu.schedule.days) {
    for (const m of day.meals) got.set(m.slot, (got.get(m.slot) ?? 0) + m.nutrients.kcal);
  }
  console.log('\nфактически в расписании:');
  for (const slot of ['breakfast', 'lunch', 'snack', 'dinner'] as MealSlot[]) {
    const cap = target * MEAL_ENERGY_SHARE[slot];
    console.log(
      `${slot.padEnd(11)} ${Math.round(got.get(slot) ?? 0).toString().padStart(7)} из ${Math.round(cap)} ` +
        `(${(((got.get(slot) ?? 0) / cap) * 100).toFixed(0)}%)`,
    );
  }

  // что не влезло, по слотам
  const un = new Map<string, number>();
  for (const u of menu.schedule.unplaced) {
    const key = u.recipe.slots.join('+');
    un.set(key, (un.get(key) ?? 0) + u.portions * 1);
  }
  console.log('\nне размещено по наборам слотов:', [...un.entries()].map(([k, v]) => `${k}: ${v}`).join(', '));
}
