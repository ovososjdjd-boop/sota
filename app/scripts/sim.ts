/**
 * Симуляция реального пользователя — главный инструмент проверки.
 *
 * Зелёные тесты ничего не говорят о том, СЪЕДОБНО ли меню. Почти все
 * критичные дефекты (оладьи 14 раз, 233 минуты готовки, 32 пустых приёма)
 * найдены именно так: прогнать сценарий и посмотреть глазами на цифры.
 *
 * Профиль взят из docs/USER_REVIEW.md — мужчина 32 года, 180 см, 82 кг,
 * 15 000 ₽ в месяц, любит мясо и фарш, кофе каждый день, зелень не любит.
 *
 *   node scripts/run.mjs scripts/sim.ts
 */

import { planMenu, type MenuResult } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
import { grossFromNet, packsNeeded } from '../src/core/measures';

function bar(v: number, max: number, width = 28): string {
  const n = Math.max(0, Math.min(width, Math.round((v / max) * width)));
  return '█'.repeat(n) + '·'.repeat(width - n);
}

export function report(menu: MenuResult, budget: number, days: number, eaters: number) {
  if (menu.status !== 'optimal') {
    console.log('СТАТУС:', menu.status);
    for (const e of menu.explanations) console.log(' ', e.text);
    return;
  }

  const pd = days * eaters;
  console.log('─'.repeat(64));
  console.log(
    `бюджет ${budget} ₽ · ${days} дн · ${eaters} чел · решено за ${menu.solveTimeMs} мс`,
  );
  console.log('─'.repeat(64));

  // ── деньги ──
  const spent = menu.purchaseCost;
  console.log(
    `ДЕНЬГИ   чек ${Math.round(spent)} ₽ из ${budget} ₽ ` +
      `(${((spent / budget) * 100).toFixed(0)}%), не потрачено ${Math.round(budget - spent)} ₽`,
  );
  console.log(
    `         еды на ${Math.round(menu.totalCost)} ₽, остатки на ${Math.round(menu.leftoverValue)} ₽`,
  );

  // ── КБЖУ ──
  const a = menu.actual;
  const t = menu.target;
  console.log(
    `КБЖУ     ${Math.round(a.kcal / pd)} ккал/д (цель ${Math.round(t.kcal / pd)}) · ` +
      `Б ${(a.protein / pd).toFixed(0)} (${(a.protein / pd / 82).toFixed(2)} г/кг) · ` +
      `Ж ${(a.fat / pd).toFixed(0)} · У ${(a.carbs / pd).toFixed(0)}`,
  );

  // ── структура трат по категориям ──
  const byCat = new Map<string, number>();
  for (const [pid, grams] of Object.entries(menu.products)) {
    const p = PRODUCT_BY_ID[pid];
    if (!p) continue;
    const gross = grossFromNet(p, grams);
    const cost = (packsNeeded(p, gross).totalGrams / 1000) * p.pricePerKg;
    byCat.set(p.category, (byCat.get(p.category) ?? 0) + cost);
  }
  const cats = [...byCat.entries()].sort((x, y) => y[1] - x[1]);
  const maxCat = cats[0]?.[1] ?? 1;
  console.log('ТРАТЫ ПО КАТЕГОРИЯМ');
  for (const [cat, cost] of cats.slice(0, 8)) {
    console.log(`   ${cat.padEnd(10)} ${bar(cost, maxCat)} ${Math.round(cost)} ₽`);
  }

  // ── доля энергии по категориям ──
  const kcalByCat = new Map<string, number>();
  let totalK = 0;
  for (const d of menu.demands) {
    for (const [cat, k] of Object.entries(d.stats.categoryKcal)) {
      kcalByCat.set(cat, (kcalByCat.get(cat) ?? 0) + (k as number) * d.portions);
      totalK += (k as number) * d.portions;
    }
  }
  const meatShare = ((kcalByCat.get('meat') ?? 0) / totalK) * 100;
  const fishShare = ((kcalByCat.get('fish') ?? 0) / totalK) * 100;
  const fruitShare = ((kcalByCat.get('fruit') ?? 0) / totalK) * 100;
  console.log(
    `ЭНЕРГИЯ  мясо ${meatShare.toFixed(1)}% · рыба ${fishShare.toFixed(1)}% · ` +
      `фрукты ${fruitShare.toFixed(1)}%`,
  );

  // ── разнообразие ──
  const served = new Map<string, number>();
  const daySignature: string[] = [];
  let emptyMeals = 0;
  let totalMinutes = 0;
  let worstDay = 0;
  for (const day of menu.schedule.days) {
    const sig: string[] = [];
    for (const meal of day.meals) {
      if (meal.dishes.length === 0 && meal.slot !== 'snack') emptyMeals++;
      for (const dish of meal.dishes) {
        served.set(dish.recipe.id, (served.get(dish.recipe.id) ?? 0) + 1);
        sig.push(dish.recipe.id);
      }
    }
    daySignature.push([...sig].sort().join('|'));
    totalMinutes += day.minutes;
    worstDay = Math.max(worstDay, day.minutes);
  }
  const dupDays = daySignature.length - new Set(daySignature).size;
  const top = [...served.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
  console.log(
    `МЕНЮ     блюд ${served.size} из ${RECIPES.length} · одинаковых дней ${dupDays} · ` +
      `пустых приёмов ${emptyMeals}`,
  );
  console.log(
    `         топ подач: ${top.map(([id, n]) => `${RECIPES.find((r) => r.id === id)?.name} ×${n}`).join(', ')}`,
  );
  console.log(
    `ГОТОВКА  ${Math.round(totalMinutes / days)} мин/д в среднем, худший день ${worstDay} мин`,
  );

  const unplaced = menu.schedule.unplaced.reduce((s, x) => s + x.portions, 0);
  const totalPortions = menu.demands.reduce((s, d) => s + d.portions, 0);
  console.log(
    `ОСТАТКИ  не размещено ${unplaced} из ${totalPortions} порций ` +
      `(${((unplaced / totalPortions) * 100).toFixed(1)}%)`,
  );

  // ── закупка: крупные позиции ──
  const lines = Object.entries(menu.products)
    .map(([pid, g]) => {
      const p = PRODUCT_BY_ID[pid];
      if (!p) return null;
      const gross = grossFromNet(p, g);
      const packs = packsNeeded(p, gross);
      return {
        name: p.name,
        grams: packs.totalGrams,
        shelf: p.shelfLifeDays,
        perishable: p.perishable,
        cost: (packs.totalGrams / 1000) * p.pricePerKg,
      };
    })
    .filter(Boolean) as { name: string; grams: number; shelf: number; perishable: boolean; cost: number }[];
  const risky = lines
    .filter((l) => l.shelf < days && l.grams > 1500)
    .sort((x, y) => y.grams - x.grams);
  if (risky.length) {
    console.log('ХРАНЕНИЕ (позиции больше 1.5 кг со сроком меньше периода)');
    for (const l of risky.slice(0, 6)) {
      console.log(
        `   ${l.name.padEnd(22)} ${(l.grams / 1000).toFixed(1)} кг, срок ${l.shelf} дн`,
      );
    }
  }

  console.log('ПОДСКАЗКИ');
  for (const e of menu.explanations) console.log(`   [${e.kind}] ${e.text}`);
}

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  // «люблю мясо с гарниром, в основном фарш, больше белка, меньше зелени»
  prefs.products['mince'] = 'often';
  
  prefs.products['pork'] = 'often';
  prefs.products['chicken_fillet'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  for (const days of [7, 30]) {
    const budget = days === 30 ? 15000 : 3500;
    const menu = await planMenu(
      {
        budget,
        days,
        eaters: [makeEaterLike()],
        preferences: prefs,
        maxCookingMinutes: 60,
      },
      RECIPES,
    );
    report(menu, budget, days, 1);
    console.log();
  }
}
