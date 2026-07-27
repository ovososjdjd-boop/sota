/**
 * Сколько порций «напитков» раскладка РЕАЛЬНО может разместить?
 *
 * Модель считает места как «дни × слоты»: для пары завтрак+перекус
 * это 60 мест на месяц. Проверяем это прямым экспериментом: подаём
 * раскладке заведомо избыточный заказ напитков и смотрим, сколько
 * из него доедет до тарелки.
 */
import { buildSchedule } from '../src/core/menu';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { computeRecipeStats } from '../src/core/recipes';
import type { DishDemand } from '../src/core/menu';

export default async function main() {
  const drinks = RECIPES.filter((r) => r.role === 'drink');
  const staples = RECIPES.filter((r) =>
    ['porridge', 'soup', 'main', 'side'].includes(r.role),
  ).slice(0, 12);

  // нормальный «костяк» рациона плюс гора напитков
  const demands: DishDemand[] = [];
  for (const r of staples)
    demands.push({ stats: computeRecipeStats(r, PRODUCT_BY_ID), portions: 6, daily: false });
  for (const r of drinks)
    demands.push({ stats: computeRecipeStats(r, PRODUCT_BY_ID), portions: 15, daily: false });

  const s = buildSchedule(demands, 30, 1, 2506, 90);
  let placed = 0;
  const bySlot = new Map<string, number>();
  for (const d of s.days)
    for (const meal of d.meals)
      for (const dish of meal.dishes)
        if (dish.recipe.role === 'drink') {
          placed += dish.portions;
          bySlot.set(meal.slot, (bySlot.get(meal.slot) ?? 0) + dish.portions);
        }
  const ordered = drinks.length * 15;
  console.log(`заказано напитков ${ordered}, размещено ${placed}`);
  console.log('по приёмам:', [...bySlot.entries()].map(([k, v]) => `${k} ${v}`).join(', '));
  console.log(`то есть реальная вместимость ≈ ${(placed / 30).toFixed(2)} порции в день`);
}
