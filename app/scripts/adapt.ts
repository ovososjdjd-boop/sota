/**
 * Симуляция обучения: меняется ли меню под поведение человека.
 *
 * Сценарий — три месяца подряд. Виртуальный человек ведёт себя
 * последовательно: готовит мясное, пропускает рыбное и молочные супы.
 * Приложение обязано это заметить БЕЗ единой явной настройки.
 *
 * Это главная проверка «адаптируется под него»: если после трёх
 * месяцев меню не изменилось, обучение не работает.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import {
  emptyAdaptation,
  recordEvent,
  inferProductLikings,
  rejectedDishes,
  type AdaptationState,
} from '../src/core/adaptation';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

/** Наш виртуальный человек: любит мясо, не ест рыбу и молочные супы. */
function reaction(recipeId: string): 'cooked' | 'skipped' {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r) return 'skipped';
  const hasFish = r.ingredients.some(
    (i) => PRODUCT_BY_ID[i.productId]?.category === 'fish',
  );
  const hasMeat = r.ingredients.some(
    (i) => PRODUCT_BY_ID[i.productId]?.category === 'meat',
  );
  const milkSoup = r.role === 'porridge' && r.name.includes('суп');
  if (hasFish || milkSoup) return 'skipped';
  if (hasMeat) return 'cooked';
  // остальное готовит через раз
  return Math.random() > 0.4 ? 'cooked' : 'skipped';
}

function shareOf(
  menu: Awaited<ReturnType<typeof planMenu>>,
  category: string,
): number {
  let sum = 0;
  let total = 0;
  for (const day of menu.schedule.days)
    for (const meal of day.meals)
      for (const dish of meal.dishes)
        for (const ing of dish.recipe.ingredients) {
          const p = PRODUCT_BY_ID[ing.productId];
          if (!p) continue;
          const k = ((p.per100g.kcal * ing.grams) / 100) * dish.portions;
          if (p.category === category) sum += k;
          total += k;
        }
  return total > 0 ? (sum / total) * 100 : 0;
}

export default async function main() {
  let adaptation: AdaptationState = emptyAdaptation();

  for (let month = 1; month <= 3; month++) {
    const menu = await planMenu(
      {
        budget: 15000,
        days: 30,
        eaters: [makeEaterLike()],
        preferences: emptyPreferences(),
        adaptation,
      },
      RECIPES,
    );
    if (menu.status !== 'optimal') {
      console.log(`месяц ${month}: ${menu.status}`);
      continue;
    }

    console.log(
      `\nМЕСЯЦ ${month}: мясо ${shareOf(menu, 'meat').toFixed(1)}%  ` +
        `рыба ${shareOf(menu, 'fish').toFixed(1)}%  ` +
        `блюд ${menu.demands.length}  ккал/д ${(menu.actual.kcal / 30).toFixed(0)}`,
    );

    // человек «прожил» месяц
    const seen = new Set<string>();
    for (const day of menu.schedule.days)
      for (const meal of day.meals)
        for (const dish of meal.dishes) {
          adaptation = recordEvent(adaptation, dish.recipe.id, reaction(dish.recipe.id));
          seen.add(dish.recipe.id);
        }

    const rejected = rejectedDishes(adaptation);
    const inferred = inferProductLikings(adaptation, RECIPES);
    console.log(
      `   после месяца: отвергнуто блюд ${rejected.length}, ` +
        `выучено продуктов ${inferred.length}`,
    );
    if (inferred.length) {
      console.log(
        '   выучено: ' +
          inferred
            .slice(0, 8)
            .map((x) => `${x.product.name}=${x.liking}`)
            .join(', '),
      );
    }
  }
}
