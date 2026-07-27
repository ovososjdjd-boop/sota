/**
 * Продолжение симуляции: смотрю меню за неделю подряд и список покупок.
 * Это то, с чем человек живёт каждый день.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { planWaves } from '../src/core/waves';
import { mass } from '../src/core/format';
import type { EaterProfile } from '../src/core/types';

const me: EaterProfile = {
  id: 'me', name: 'Я', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', proteinPerKg: 1.8,
  excludedProducts: [], dietTags: [],
};

function myPreferences(): Preferences {
  const p = emptyPreferences();
  p.products['mince'] = 'often';
  p.products['mince_chicken'] = 'often';
  p.products['pork'] = 'often';
  p.products['chicken_fillet'] = 'often';
  p.products['beef'] = 'often';
  p.products['greens'] = 'never';
  p.dishes['coffee_milk'] = 'always';
  return p;
}

export default async function main() {
  const menu = await planMenu(
    { budget: 15000, days: 30, eaters: [me], preferences: myPreferences() },
    RECIPES,
  );
  if (menu.status !== 'optimal') return console.log(menu.status);

  console.log('НЕДЕЛЯ ПОДРЯД — то, что я реально увижу\n');
  const slot: Record<string, string> = {
    breakfast: 'зав', lunch: 'обед', snack: 'пер', dinner: 'ужин',
  };
  for (const d of menu.schedule.days.slice(0, 7)) {
    const parts: string[] = [];
    for (const meal of d.meals) {
      if (meal.dishes.length === 0) continue;
      parts.push(
        `${slot[meal.slot]}: ${meal.dishes.map((x) => x.recipe.name).join(' + ')}`,
      );
    }
    console.log(`День ${String(d.index + 1).padStart(2)} (${Math.round(d.nutrients.kcal)} ккал, ${d.minutes} мин)`);
    for (const p of parts) console.log(`   ${p}`);
  }

  // ── список покупок первого похода ──
  const waves = planWaves(menu.schedule);
  const w = waves[0];
  console.log(`\n\nСПИСОК ПОКУПОК — поход 1 (${Math.round(w.cost)} ₽, ${w.lines.length} позиций)\n`);
  const byCat = new Map<string, typeof w.lines>();
  for (const l of w.lines) {
    const c = l.product.category;
    byCat.set(c, [...(byCat.get(c) ?? []), l]);
  }
  for (const [cat, lines] of byCat) {
    console.log(`${cat}:`);
    for (const l of lines) {
      const packInfo = l.product.packSizes.length
        ? `${l.packs} × ${mass(l.packSize)}`
        : mass(l.buyGrams);
      console.log(
        `   ${l.product.name.padEnd(32)} ${packInfo.padEnd(14)} ${Math.round(l.cost).toString().padStart(4)} ₽` +
          `${l.advice === 'freeze' ? '  ❄ заморозить' : l.advice === 'buyLater' ? '  ⏱ докупить позже' : ''}`,
      );
    }
  }

  // ── сколько раз повторяется каждое блюдо ──
  const served = new Map<string, number[]>();
  for (const d of menu.schedule.days)
    for (const meal of d.meals)
      for (const dish of meal.dishes) {
        const l = served.get(dish.recipe.name) ?? [];
        l.push(d.index + 1);
        served.set(dish.recipe.name, l);
      }
  console.log('\n\nПОВТОРЫ ЗА МЕСЯЦ (топ-12)');
  for (const [name, list] of [...served.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)) {
    console.log(`   ${String(list.length).padStart(2)}× ${name.padEnd(34)} дни: ${list.join(',')}`);
  }

  // ── проверка мер: совпадает ли подпись с граммами ──
  console.log('\n\nПРОВЕРКА МЕР В РЕЦЕПТАХ (где подпись расходится с массой)');
  let bad = 0;
  for (const d of menu.demands.slice(0, 40)) {
    for (const ing of d.stats.recipe.ingredients) {
      const p = PRODUCT_BY_ID[ing.productId];
      if (!p) continue;
      // ищем меру-упаковку, где число в названии не равно факту
      for (const m of p.measures) {
        const num = m.label.match(/(\d+)\s*г/);
        if (!num) continue;
        if (Math.abs(Number(num[1]) - m.grams) > 1) {
          console.log(`   ${p.name}: мера «${m.label}», а по факту ${m.grams} г`);
          bad++;
        }
      }
    }
  }
  if (bad === 0) console.log('   расхождений в самих мерах нет');
}
