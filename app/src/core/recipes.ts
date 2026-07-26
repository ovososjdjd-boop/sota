/**
 * Рецепты: блюда, собранные из продуктов базы.
 *
 * Ключевые принципы (обоснование — docs/STAGE4.md):
 *  1. Ингредиенты задаются в СЫРОМ виде — именно это покупают в магазине.
 *  2. Масса порции считается по ГОТОВОМУ блюду с учётом ужарки/уварки.
 *  3. КБЖУ и цена не хранятся, а вычисляются из ингредиентов — единый
 *     источник правды, невозможно рассинхронизировать.
 */

import type { Nutrients, Product, ProductCategory, CookingMethod } from './types';
import { PRODUCT_BY_ID } from '../data/products';
import { grossFromNet, pickMeasure } from './measures';

/** Приём пищи, для которого уместно блюдо. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

/**
 * Доли суточной калорийности по приёмам пищи.
 * Источник: СанПиН 2.4.5.2409-08 (четырёхразовое питание).
 * Допуск по отдельному приёму — ±5 процентных пунктов.
 */
export const MEAL_ENERGY_SHARE: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  snack: 0.15,
  dinner: 0.25,
};

export const MEAL_SHARE_TOLERANCE = 0.05;

/** Роль блюда в приёме пищи — нужна для правил сочетаемости. */
export type DishRole =
  | 'porridge' // каша
  | 'soup' // суп
  | 'main' // основное блюдо
  | 'side' // гарнир
  | 'salad' // салат
  | 'snack' // перекус
  | 'drink' // напиток
  | 'bakery'; // выпечка, бутерброд

export const ROLE_LABEL: Record<DishRole, string> = {
  porridge: 'Каша',
  soup: 'Суп',
  main: 'Основное',
  side: 'Гарнир',
  salad: 'Салат',
  snack: 'Перекус',
  drink: 'Напиток',
  bakery: 'Выпечка',
};

export interface Ingredient {
  productId: string;
  /** Масса нетто (съедобной части) в СЫРОМ виде на одну порцию, г */
  grams: number;
  /** Способ обработки — влияет на выход готового продукта */
  method?: CookingMethod;
}

export interface Recipe {
  id: string;
  name: string;
  role: DishRole;
  /** В какие приёмы пищи блюдо уместно */
  slots: MealSlot[];
  ingredients: Ingredient[];
  /** Время приготовления, мин */
  minutes: number;
  /**
   * На сколько порций разумно готовить за раз (batch cooking).
   * Суп варят кастрюлей на несколько дней, яичницу — на один раз.
   */
  batchPortions: number;
  /** Сколько дней блюдо хранится готовым */
  keepsDays: number;
  /**
   * Шаги приготовления. Без них приложением нельзя пользоваться:
   * человек видит «Свинина тушёная, 622 ккал» и не знает, что делать.
   */
  steps?: string[];
  tags: string[];
}

/** Развёрнутые характеристики блюда — считаются из ингредиентов. */
export interface RecipeStats {
  recipe: Recipe;
  /** КБЖУ одной порции */
  nutrients: Nutrients;
  /** Цена одной порции, ₽ (с учётом несъедобных частей — платим за брутто) */
  cost: number;
  /** Масса готовой порции, г */
  cookedGrams: number;
  /** Масса сырых продуктов на порцию (нетто), г */
  rawGrams: number;
  /** Энергия по категориям продуктов — для кулинарных ограничений */
  categoryKcal: Partial<Record<ProductCategory, number>>;
  /** Граммы по категориям — для лимитов и проверки овощей */
  categoryGrams: Partial<Record<ProductCategory, number>>;
  /** Все ли ингредиенты есть в базе */
  valid: boolean;
}

/** Коэффициент выхода готового продукта из сырого. */
function yieldFactor(product: Product, method?: CookingMethod): number {
  if (!method || method === 'raw') return 1;
  return product.yields[method] ?? 1;
}

/**
 * Расчёт характеристик блюда из ингредиентов.
 * Единственный источник правды: КБЖУ и цена нигде не дублируются.
 */
export function computeRecipeStats(
  recipe: Recipe,
  products: Record<string, Product> = PRODUCT_BY_ID,
): RecipeStats {
  const nutrients: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  const categoryKcal: Partial<Record<ProductCategory, number>> = {};
  const categoryGrams: Partial<Record<ProductCategory, number>> = {};
  let cost = 0;
  let cookedGrams = 0;
  let rawGrams = 0;
  let valid = true;

  for (const ing of recipe.ingredients) {
    const product = products[ing.productId];
    if (!product) {
      valid = false;
      continue;
    }

    const k = ing.grams / 100;
    nutrients.kcal += product.per100g.kcal * k;
    nutrients.protein += product.per100g.protein * k;
    nutrients.fat += product.per100g.fat * k;
    nutrients.carbs += product.per100g.carbs * k;
    nutrients.fiber = (nutrients.fiber ?? 0) + (product.per100g.fiber ?? 0) * k;

    // платим за брутто: кожура, кости и скорлупа тоже стоят денег
    const gross = grossFromNet(product, ing.grams);
    cost += (gross / 1000) * product.pricePerKg;

    const cat = product.category;
    categoryKcal[cat] = (categoryKcal[cat] ?? 0) + product.per100g.kcal * k;
    categoryGrams[cat] = (categoryGrams[cat] ?? 0) + ing.grams;

    rawGrams += ing.grams;
    cookedGrams += ing.grams * yieldFactor(product, ing.method);
  }

  return {
    recipe,
    nutrients,
    cost,
    cookedGrams,
    rawGrams,
    categoryKcal,
    categoryGrams,
    valid,
  };
}

/** Ингредиенты блюда для списка покупок: сколько сырых продуктов нужно. */
export function expandToProducts(
  recipe: Recipe,
  portions: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ing of recipe.ingredients) {
    out[ing.productId] = (out[ing.productId] ?? 0) + ing.grams * portions;
  }
  return out;
}

/** Пригодно ли блюдо для конкретного приёма пищи. */
export function fitsSlot(recipe: Recipe, slot: MealSlot): boolean {
  return recipe.slots.includes(slot);
}

/** Соответствует ли блюдо диетическим тегам всех едоков. */
export function matchesDietTags(
  stats: RecipeStats,
  requiredTags: string[],
  products: Record<string, Product> = PRODUCT_BY_ID,
): boolean {
  if (requiredTags.length === 0) return true;
  for (const ing of stats.recipe.ingredients) {
    const product = products[ing.productId];
    if (!product) return false;
    for (const tag of requiredTags) {
      if (!product.tags.includes(tag)) return false;
    }
  }
  return true;
}

/** Содержит ли блюдо исключённые продукты. */
export function hasExcluded(recipe: Recipe, excluded: Set<string>): boolean {
  return recipe.ingredients.some((i) => excluded.has(i.productId));
}

/**
 * Раскладка рецепта на конкретное число порций — то, что человек
 * реально видит перед готовкой: какой продукт и сколько взять.
 */
export interface RecipePortion {
  productId: string;
  name: string;
  /** Масса нетто на все порции, г */
  grams: number;
  /** Человекочитаемая мера: «2 стакана», «3 шт» */
  measure: string;
  /** Способ обработки, если задан */
  method?: CookingMethod;
}

/**
 * Состав блюда на N порций в домашних мерах.
 * Именно это выводится в карточке рецепта.
 */
export function recipePortions(
  recipe: Recipe,
  portions: number,
  products: Record<string, Product> = PRODUCT_BY_ID,
): RecipePortion[] {
  const out: RecipePortion[] = [];
  for (const ing of recipe.ingredients) {
    const product = products[ing.productId];
    if (!product) continue;
    const grams = ing.grams * portions;
    const q = pickMeasure(product, grams);
    out.push({
      productId: ing.productId,
      name: product.name,
      grams,
      measure: q ? q.text : `${Math.round(grams)} г`,
      method: ing.method,
    });
  }
  // сначала основные ингредиенты, приправы в конце
  return out.sort((a, b) => b.grams - a.grams);
}
