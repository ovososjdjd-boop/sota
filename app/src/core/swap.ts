/**
 * Замена блюда в меню.
 *
 * Принцип: пользователь должен чувствовать, что управляет меню,
 * а не смотрит на выданное. Не понравилось блюдо — заменил на
 * равноценное, и всё пересчиталось.
 *
 * Альтернатива подбирается по трём критериям:
 *  1) подходит тому же приёму пищи и играет ту же роль;
 *  2) близка по калорийности — чтобы день не «поехал»;
 *  3) не нарушает правило неповторения в соседних днях.
 */

import type { Recipe } from './recipes';
import { computeRecipeStats, type RecipeStats } from './recipes';
import type { MenuSchedule, PlannedDay } from './menu';
import { MIN_REPEAT_GAP_DAYS } from './menu';
import type { Product } from './types';
import { PRODUCT_BY_ID } from '../data/products';

export interface SwapCandidate {
  stats: RecipeStats;
  /** Разница в калорийности порции, ккал */
  kcalDelta: number;
  /** Разница в цене порции, ₽ */
  costDelta: number;
  /** Насколько хорошо подходит: 0..1 */
  score: number;
}

export interface SwapContext {
  schedule: MenuSchedule;
  dayIndex: number;
  slot: string;
  /** Заменяемое блюдо */
  current: Recipe;
  /** Все доступные рецепты */
  recipes: Recipe[];
  /** Исключённые продукты */
  excluded?: Set<string>;
  /** Диетические теги всех едоков */
  dietTags?: string[];
  products?: Record<string, Product>;
}

/** Совместима ли роль блюда с заменяемым. */
function roleCompatible(a: Recipe, b: Recipe): boolean {
  if (a.role === b.role) return true;
  // каша и гарнир взаимозаменяемы как углеводная основа
  const base = ['porridge', 'side'];
  if (base.includes(a.role) && base.includes(b.role)) return true;
  // перекус и напиток тоже
  const light = ['snack', 'drink'];
  return light.includes(a.role) && light.includes(b.role);
}

/** Подавалось ли блюдо в соседние дни. */
function servedNearby(schedule: MenuSchedule, recipeId: string, dayIndex: number): boolean {
  for (const day of schedule.days) {
    if (Math.abs(day.index - dayIndex) >= MIN_REPEAT_GAP_DAYS) continue;
    if (day.index === dayIndex) continue;
    for (const meal of day.meals) {
      if (meal.dishes.some((d) => d.recipe.id === recipeId)) return true;
    }
  }
  return false;
}

/**
 * Подбор альтернатив для замены блюда.
 * Возвращает до `limit` вариантов, отсортированных по пригодности.
 */
export function findAlternatives(ctx: SwapContext, limit = 8): SwapCandidate[] {
  const products = ctx.products ?? PRODUCT_BY_ID;
  const currentStats = computeRecipeStats(ctx.current, products);
  const excluded = ctx.excluded ?? new Set<string>();
  const tags = ctx.dietTags ?? [];

  const day: PlannedDay | undefined = ctx.schedule.days[ctx.dayIndex];
  const inDayToday = new Set<string>();
  if (day) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) inDayToday.add(dish.recipe.id);
    }
  }

  const out: SwapCandidate[] = [];

  for (const recipe of ctx.recipes) {
    if (recipe.id === ctx.current.id) continue;
    if (!recipe.slots.includes(ctx.slot as never)) continue;
    if (!roleCompatible(ctx.current, recipe)) continue;
    if (inDayToday.has(recipe.id)) continue;

    // исключённые продукты и диетические ограничения
    let blocked = false;
    for (const ing of recipe.ingredients) {
      if (excluded.has(ing.productId)) {
        blocked = true;
        break;
      }
      const product = products[ing.productId];
      if (!product) {
        blocked = true;
        break;
      }
      for (const tag of tags) {
        if (!product.tags.includes(tag)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
    if (blocked) continue;

    const stats = computeRecipeStats(recipe, products);
    if (!stats.valid || stats.nutrients.kcal <= 0) continue;

    const kcalDelta = stats.nutrients.kcal - currentStats.nutrients.kcal;
    const costDelta = stats.cost - currentStats.cost;

    // близость по калорийности — главный критерий
    const kcalError =
      Math.abs(kcalDelta) / Math.max(1, currentStats.nutrients.kcal);
    let score = 1 - Math.min(kcalError, 1);

    // штраф за повтор в соседних днях
    if (servedNearby(ctx.schedule, recipe.id, ctx.dayIndex)) score -= 0.45;

    // лёгкое предпочтение более дешёвым и быстрым
    if (costDelta < 0) score += 0.08;
    if (recipe.minutes < ctx.current.minutes) score += 0.05;

    // и более богатым белком
    if (stats.nutrients.protein > currentStats.nutrients.protein) score += 0.05;

    out.push({ stats, kcalDelta, costDelta, score });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Применение замены к расписанию.
 * Возвращает новое расписание — исходное не мутируется.
 */
export function applySwap(
  schedule: MenuSchedule,
  dayIndex: number,
  slot: string,
  fromRecipeId: string,
  to: RecipeStats,
): MenuSchedule {
  const days = schedule.days.map((day) => {
    if (day.index !== dayIndex) return day;

    const meals = day.meals.map((meal) => {
      if (meal.slot !== slot) return meal;
      if (!meal.dishes.some((d) => d.recipe.id === fromRecipeId)) return meal;

      const dishes = meal.dishes.map((dish) =>
        dish.recipe.id === fromRecipeId
          ? { recipe: to.recipe, stats: to, portions: dish.portions, cooked: true }
          : dish,
      );

      const nutrients = dishes.reduce(
        (acc, d) => ({
          kcal: acc.kcal + d.stats.nutrients.kcal * d.portions,
          protein: acc.protein + d.stats.nutrients.protein * d.portions,
          fat: acc.fat + d.stats.nutrients.fat * d.portions,
          carbs: acc.carbs + d.stats.nutrients.carbs * d.portions,
          fiber: (acc.fiber ?? 0) + (d.stats.nutrients.fiber ?? 0) * d.portions,
        }),
        { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
      );

      const minutes = dishes.reduce(
        (acc, d) => acc + (d.cooked ? d.recipe.minutes : 0),
        0,
      );

      return { ...meal, dishes, nutrients, minutes };
    });

    const nutrients = meals.reduce(
      (acc, m) => ({
        kcal: acc.kcal + m.nutrients.kcal,
        protein: acc.protein + m.nutrients.protein,
        fat: acc.fat + m.nutrients.fat,
        carbs: acc.carbs + m.nutrients.carbs,
        fiber: (acc.fiber ?? 0) + (m.nutrients.fiber ?? 0),
      }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    );

    const minutes = meals.reduce((acc, m) => acc + m.minutes, 0);

    return { ...day, meals, nutrients, minutes };
  });

  return { ...schedule, days };
}

/** Пересчёт списка продуктов после замен. */
export function recalcProducts(schedule: MenuSchedule): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of schedule.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        for (const ing of dish.recipe.ingredients) {
          out[ing.productId] = (out[ing.productId] ?? 0) + ing.grams * dish.portions;
        }
      }
    }
  }
  return out;
}

/** Стоимость расписания по ингредиентам. */
export function scheduleCost(
  schedule: MenuSchedule,
  products: Record<string, Product> = PRODUCT_BY_ID,
): number {
  let total = 0;
  for (const [productId, grams] of Object.entries(recalcProducts(schedule))) {
    const product = products[productId];
    if (!product) continue;
    const gross = grams / (1 - product.wasteRatio);
    total += (gross / 1000) * product.pricePerKg;
  }
  return total;
}
