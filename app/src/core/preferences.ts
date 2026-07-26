/**
 * Предпочтения пользователя.
 *
 * Отзыв: «Я могу только исключать продукты. Не могу сказать: хочу больше
 * мяса, фарш — мой любимый продукт, кофе каждое утро обязательно».
 *
 * Механика взята у Eat This Much (Recurring Foods) — она проверена
 * миллионами пользователей и работает без ИИ:
 *   always — блюдо закреплено, остальное меню строится вокруг него
 *   often  — предлагается заметно чаще прочих
 *   rare   — предлагается заметно реже
 *   never  — не предлагается вовсе
 *
 * Дополнительно: предпочтения по ПРОДУКТАМ (люблю фарш) автоматически
 * поднимают все блюда, где этот продукт есть. Пользователю не нужно
 * перебирать 112 рецептов — достаточно отметить любимые продукты.
 */

import type { Recipe } from './recipes';
import type { Product } from './types';
import { PRODUCT_BY_ID } from '../data/products';

export type Liking = 'always' | 'often' | 'neutral' | 'rare' | 'never';

export const LIKING_LABEL: Record<Liking, string> = {
  always: 'Каждый день',
  often: 'Люблю',
  neutral: 'Обычно',
  rare: 'Редко',
  never: 'Не предлагать',
};

/** Насколько сильно предпочтение влияет на выбор. */
export const LIKING_WEIGHT: Record<Liking, number> = {
  always: 3,
  often: 1.6,
  neutral: 1,
  rare: 0.45,
  never: 0,
};

export interface Preferences {
  /** Предпочтения по блюдам: recipeId → оценка */
  dishes: Record<string, Liking>;
  /** Предпочтения по продуктам: productId → оценка */
  products: Record<string, Liking>;
}

export function emptyPreferences(): Preferences {
  return { dishes: {}, products: {} };
}

/**
 * Итоговый множитель предпочтения для блюда.
 *
 * Логика приоритетов:
 *  1. Явная оценка блюда важнее оценок его продуктов.
 *  2. Если продукт помечен «не предлагать» — блюдо исключается целиком.
 *  3. Иначе берётся среднее по значимым продуктам, взвешенное их массой:
 *     любовь к фаршу должна влиять на «макароны по-флотски» сильнее,
 *     чем на блюдо, где фарша ложка.
 */
export function dishPreference(
  recipe: Recipe,
  prefs: Preferences,
  products: Record<string, Product> = PRODUCT_BY_ID,
): number {
  const explicit = prefs.dishes[recipe.id];
  if (explicit) return LIKING_WEIGHT[explicit];

  let weighted = 0;
  let totalMass = 0;
  let blocked = false;

  for (const ing of recipe.ingredients) {
    const liking = prefs.products[ing.productId];
    if (!liking) continue;
    if (liking === 'never') {
      blocked = true;
      break;
    }
    const product = products[ing.productId];
    // приправы не должны определять отношение к блюду
    const isCondiment = product?.tags.includes('condiment') ?? false;
    const mass = isCondiment ? ing.grams * 0.25 : ing.grams;
    weighted += LIKING_WEIGHT[liking] * mass;
    totalMass += mass;
  }

  if (blocked) return 0;
  if (totalMass === 0) return 1;

  // сглаживаем: даже блюдо целиком из любимых продуктов не должно
  // получать преимущество больше, чем явная отметка «люблю»
  const raw = weighted / totalMass;
  return Math.max(0.3, Math.min(raw, 2.2));
}

/** Блюда, которые пользователь хочет видеть каждый день. */
export function alwaysDishes(prefs: Preferences, recipes: Recipe[]): Recipe[] {
  return recipes.filter((r) => prefs.dishes[r.id] === 'always');
}

/** Полностью исключённые блюда. */
export function isBlocked(
  recipe: Recipe,
  prefs: Preferences,
  products: Record<string, Product> = PRODUCT_BY_ID,
): boolean {
  return dishPreference(recipe, prefs, products) === 0;
}

/**
 * Продукты, которые стоит предложить пользователю для оценки.
 * Показываем самые «влиятельные» — те, что встречаются во многих блюдах:
 * отметив десяток, человек заметно меняет меню.
 */
export function suggestedProducts(
  recipes: Recipe[],
  limit = 24,
  products: Record<string, Product> = PRODUCT_BY_ID,
): Product[] {
  const usage = new Map<string, number>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const product = products[ing.productId];
      if (!product) continue;
      // приправы и мелочи оценивать бессмысленно
      if (product.tags.includes('condiment')) continue;
      if (ing.grams < 25) continue;
      usage.set(ing.productId, (usage.get(ing.productId) ?? 0) + 1);
    }
  }
  return [...usage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => products[id])
    .filter(Boolean);
}
