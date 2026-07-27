/**
 * ОБЕЩАНИЯ ПОЛЬЗОВАТЕЛЮ.
 *
 * Эти тесты проверяют не реализацию, а договор: если человек что-то
 * попросил в интерфейсе, приложение обязано это сделать. Написаны
 * после того, как один и тот же дефект — «просьба не влияет на меню» —
 * всплыл трижды подряд в разных обличьях:
 *
 *   «деликатесы не попадают в меню при большом бюджете»
 *   «отметил фарш любимым — он в одном блюде из двенадцати»
 *   «попросил десерт — десертов ноль»
 *
 * Каждый раз чинилось точечно, под конкретную категорию. Корень был
 * общий: LP-релаксация отбирала шорт-лист, не зная о просьбе, а MILP
 * применял награды к пустому множеству.
 *
 * Здесь мы фиксируем именно ДОГОВОР, а не механику. Тест сформулирован
 * так, чтобы упасть при любом повторении этого класса ошибок —
 * с какой бы стороны он ни зашёл в следующий раз.
 */

import { describe, it, expect } from 'vitest';
import { planMenu } from '../menuPlanner';
import { RECIPES } from '../../data/recipes';
import { PRODUCT_BY_ID } from '../../data/products';
import { emptyPreferences, type Preferences } from '../preferences';
import type { EaterProfile } from '../types';

const eater: EaterProfile = {
  id: 'u',
  name: 'Тест',
  sex: 'male',
  age: 32,
  heightCm: 180,
  weightKg: 82,
  activity: 'sedentary',
  goal: 'maintain',
  excludedProducts: [],
  dietTags: [],
};

/** Сколько раз продукт реально попал на тарелку и из скольких блюд. */
function productUsage(
  menu: Awaited<ReturnType<typeof planMenu>>,
  productId: string,
): { grams: number; dishes: Set<string> } {
  let grams = 0;
  const dishes = new Set<string>();
  for (const day of menu.schedule.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        for (const ing of dish.recipe.ingredients) {
          if (ing.productId !== productId) continue;
          grams += ing.grams * dish.portions;
          if (ing.grams >= 40) dishes.add(dish.recipe.id);
        }
      }
    }
  }
  return { grams, dishes };
}

describe('обещания пользователю', () => {
  it('«люблю продукт» приводит его в меню, причём в разных блюдах', async () => {
    const prefs: Preferences = emptyPreferences();
    prefs.products['mince'] = 'often';

    const menu = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: prefs },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');

    const used = productUsage(menu, 'mince');
    // В базе более десяти блюд с фаршем. Одно блюдо — это не «люблю фарш»,
    // это «нашли лазейку в формулировке требования».
    expect(used.grams, 'фарша в меню').toBeGreaterThan(300);
    expect(used.dishes.size, 'разных блюд с фаршем').toBeGreaterThanOrEqual(2);
  }, 90000);

  it('отметка «люблю» заметно меняет рацион, а не украшает его', async () => {
    const plain = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: emptyPreferences() },
      RECIPES,
    );
    const prefs: Preferences = emptyPreferences();
    for (const id of ['mince', 'pork', 'chicken_fillet', 'beef']) {
      prefs.products[id] = 'often';
    }
    const liked = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: prefs },
      RECIPES,
    );
    expect(plain.status).toBe('optimal');
    expect(liked.status).toBe('optimal');

    const meatShare = (m: typeof plain) => {
      let meat = 0;
      let total = 0;
      for (const day of m.schedule.days)
        for (const meal of day.meals)
          for (const dish of meal.dishes)
            for (const ing of dish.recipe.ingredients) {
              const p = PRODUCT_BY_ID[ing.productId];
              if (!p) continue;
              const k = ((p.per100g.kcal * ing.grams) / 100) * dish.portions;
              if (p.category === 'meat') meat += k;
              total += k;
            }
      return total > 0 ? meat / total : 0;
    };

    // Раньше отметка «люблю мясо» двигала долю мяса с 7.4% на 7.5% —
    // то есть не делала ничего. Требуем ощутимой разницы.
    expect(meatShare(liked)).toBeGreaterThan(meatShare(plain) * 1.2);
  }, 120000);

  it('«не предлагать» соблюдается абсолютно', async () => {
    const prefs: Preferences = emptyPreferences();
    prefs.products['greens'] = 'never';
    const menu = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: prefs },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');
    expect(productUsage(menu, 'greens').grams).toBe(0);
  }, 90000);

  it('привычка «каждый день» подаётся во все дни без исключений', async () => {
    const prefs: Preferences = emptyPreferences();
    prefs.dishes['coffee_milk'] = 'always';
    const days = 30;
    const menu = await planMenu(
      { budget: 15000, days, eaters: [eater], preferences: prefs },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');

    const withCoffee = menu.schedule.days.filter((d) =>
      d.meals.some((m) => m.dishes.some((x) => x.recipe.id === 'coffee_milk')),
    ).length;
    // «Кофе каждый день, без вариантов» — значит каждый.
    expect(withCoffee, 'дней с кофе').toBe(days);
  }, 90000);

  it('ползунок белка выполняется или недобор объясняется словами', async () => {
    const menu = await planMenu(
      {
        budget: 15000,
        days: 30,
        eaters: [{ ...eater, proteinPerKg: 1.8 }],
        preferences: emptyPreferences(),
      },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');

    const perKg = menu.actual.protein / 30 / eater.weightKg;
    if (perKg < 1.8 * 0.96) {
      // Не дотянули — обязаны сказать об этом человеку, а не молчать:
      // цифра обещана в интерфейсе.
      const explained = menu.explanations.some((e) => /белк/i.test(e.text));
      expect(explained, `белок ${perKg.toFixed(2)} г/кг, а объяснения нет`).toBe(true);
    }
    // Даже с конфликтом целей грубого провала быть не должно
    expect(perKg).toBeGreaterThan(1.5);
  }, 90000);

  it('«иногда сладкого» — десерт появляется в плане', async () => {
    const menu = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: emptyPreferences() },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');
    let desserts = 0;
    for (const day of menu.schedule.days)
      for (const meal of day.meals)
        for (const dish of meal.dishes)
          if (dish.recipe.tags.includes('dessert')) desserts += dish.portions;
    // Рацион, где нельзя съесть кусок шарлотки, человек не выдержит.
    expect(desserts, 'подач десертов за месяц').toBeGreaterThanOrEqual(2);
  }, 90000);
});

describe('меню пригодно для жизни, а не только для отчёта', () => {
  it('дни ровные по калориям: человек живёт днём, а не месяцем', async () => {
    const menu = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: emptyPreferences() },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');

    const target = menu.target.kcal / 30;
    const kcals = menu.schedule.days.map((d) => d.nutrients.kcal);
    const starving = kcals.filter((k) => k < target * 0.8).length;
    const stuffed = kcals.filter((k) => k > target * 1.25).length;

    // Было: разброс 1583-3090 при цели 2506, десять голодных дней.
    // «В сумме сходится» — не оправдание: в понедельник человек
    // недоел, в среду переел и пошёл за булкой.
    expect(starving, 'дней с сильным недобором').toBeLessThanOrEqual(4);
    expect(stuffed, 'дней с сильным перебором').toBeLessThanOrEqual(2);
  }, 90000);

  it('одно блюдо не подаётся дважды за день', async () => {
    const menu = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: emptyPreferences() },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');

    for (const day of menu.schedule.days) {
      const seen = new Map<string, number>();
      for (const meal of day.meals)
        for (const dish of meal.dishes)
          seen.set(dish.recipe.id, (seen.get(dish.recipe.id) ?? 0) + 1);
      for (const [id, n] of seen) {
        expect(n, `день ${day.index + 1}: ${id}`).toBe(1);
      }
    }
  }, 90000);

  it('одно блюдо не идёт три дня подряд', async () => {
    const menu = await planMenu(
      { budget: 15000, days: 30, eaters: [eater], preferences: emptyPreferences() },
      RECIPES,
    );
    expect(menu.status).toBe('optimal');

    const days = new Map<string, number[]>();
    for (const day of menu.schedule.days)
      for (const meal of day.meals)
        for (const dish of meal.dishes) {
          const l = days.get(dish.recipe.id) ?? [];
          if (!l.includes(day.index)) l.push(day.index);
          days.set(dish.recipe.id, l);
        }

    for (const [id, list] of days) {
      const sorted = [...list].sort((a, b) => a - b);
      for (let i = 2; i < sorted.length; i++) {
        const threeInARow =
          sorted[i] - sorted[i - 1] === 1 && sorted[i - 1] - sorted[i - 2] === 1;
        // Доесть вчерашнее — нормально. Третье утро подряд — надоело.
        expect(threeInARow, `${id}: дни ${sorted.join(',')}`).toBe(false);
      }
    }
  }, 90000);

  it('достаточный бюджет никогда не даёт отказ', async () => {
    // LP решается на всех кандидатах, а MILP — на шорт-листе, и тот
    // может вырезать блюда, без которых структура невыполнима.
    // Пользователь видел «Меню не собирается» при 15 000 ₽ на месяц.
    for (const [budget, days] of [
      [15000, 30],
      [20000, 30],
      [8000, 14],
      [5000, 7],
    ] as [number, number][]) {
      const menu = await planMenu(
        { budget, days, eaters: [eater], preferences: emptyPreferences() },
        RECIPES,
      );
      expect(menu.status, `${budget} ₽ на ${days} дн`).toBe('optimal');
    }
  }, 180000);
});
