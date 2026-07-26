/**
 * База продуктов.
 *
 * КБЖУ: справочник Скурихина/Тутельяна «Таблицы химического состава
 *       и калорийности российских продуктов питания» (НИИ питания РАМН).
 * Меры: там же, Приложение 2 (масса в мерах объёма) и Приложение 3
 *       (масса 1 штуки).
 * Цены: Росстат, средние потребительские цены по РФ, срез — июнь 2026.
 * Потери при готовке: Скурихин + нормы отходов общепита.
 *
 * Все цены — среднероссийские, пользователь может переопределить.
 */

import type { Product } from '../core/types';
import { pieceMeasure, packMeasure, volumeMeasure } from '../core/measures';

/** Дата актуальности ценового среза. */
export const PRICE_SNAPSHOT = '2026-06';
export const PRICE_SOURCE = 'Росстат, средние потребительские цены по РФ';

const SK = 'Скурихин И.М., Тутельян В.А. Таблицы химического состава (НИИ питания РАМН)';

/** Хелпер для краткости описания продуктов. */
function p(
  id: string,
  name: string,
  category: Product['category'],
  kcal: number,
  protein: number,
  fat: number,
  carbs: number,
  pricePerKg: number,
  opts: Partial<Omit<Product, 'id' | 'name' | 'category' | 'per100g' | 'pricePerKg'>> = {},
): Product {
  return {
    id,
    name,
    category,
    per100g: { kcal, protein, fat, carbs, fiber: opts.per100g?.fiber ?? 0 },
    pricePerKg,
    wasteRatio: opts.wasteRatio ?? 0,
    yields: opts.yields ?? {},
    measures: opts.measures ?? [],
    packSizes: opts.packSizes ?? [],
    shelfLifeDays: opts.shelfLifeDays ?? 180,
    perishable: opts.perishable ?? false,
    tags: opts.tags ?? [],
    source: opts.source ?? `${SK}; цена: ${PRICE_SOURCE} ${PRICE_SNAPSHOT}`,
  };
}

export const PRODUCTS: Product[] = [
  // ───────────────── Крупы и макароны ─────────────────
  p('buckwheat', 'Гречневая крупа', 'grain', 308, 12.6, 3.3, 57.1, 103, {
    yields: { boiled: 2.6 },
    measures: [volumeMeasure('glass', 1.05), volumeMeasure('tbsp', 1.0)],
    packSizes: [800, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('rice', 'Рис шлифованный', 'grain', 333, 7.0, 1.0, 74.0, 155, {
    yields: { boiled: 2.8 },
    measures: [volumeMeasure('glass', 0.9), volumeMeasure('tbsp', 1.0)],
    packSizes: [800, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('millet', 'Пшено', 'grain', 348, 11.5, 3.3, 66.5, 82, {
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 1.0), volumeMeasure('tbsp', 1.0)],
    packSizes: [800],
    shelfLifeDays: 300,
    tags: ['vegan', 'gluten-free'],
  }),
  p('oats', 'Овсяные хлопья «Геркулес»', 'grain', 352, 12.3, 6.2, 61.8, 110, {
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 0.45), volumeMeasure('tbsp', 0.8)],
    packSizes: [500, 800],
    shelfLifeDays: 300,
    tags: ['vegan'],
  }),
  p('pearl_barley', 'Крупа перловая', 'grain', 315, 9.3, 1.1, 66.9, 68, {
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 1.05), volumeMeasure('tbsp', 1.0)],
    packSizes: [800],
    shelfLifeDays: 480,
    tags: ['vegan'],
  }),
  p('pasta', 'Макароны из пшеницы в/с', 'grain', 344, 10.7, 1.3, 71.5, 168, {
    yields: { boiled: 2.5 },
    measures: [packMeasure(100, 'горсть ≈100 г')],
    packSizes: [400, 450, 900],
    shelfLifeDays: 540,
    tags: ['vegan'],
  }),
  p('semolina', 'Крупа манная', 'grain', 333, 10.3, 1.0, 70.6, 78, {
    yields: { boiled: 4.0 },
    measures: [volumeMeasure('glass', 0.8), volumeMeasure('tbsp', 1.0)],
    packSizes: [800],
    tags: ['vegan'],
  }),
  p('flour', 'Мука пшеничная', 'grain', 342, 10.3, 1.1, 70.6, 63, {
    measures: [volumeMeasure('glass', 0.8), volumeMeasure('tbsp', 0.83)],
    packSizes: [1000, 2000],
    tags: ['vegan'],
  }),

  // ───────────────── Бобовые ─────────────────
  p('lentils', 'Чечевица', 'legume', 295, 24.0, 1.5, 46.3, 145, {
    yields: { boiled: 2.5 },
    measures: [volumeMeasure('glass', 0.95), volumeMeasure('tbsp', 1.0)],
    packSizes: [450, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('peas_dry', 'Горох сухой', 'legume', 298, 20.5, 2.0, 49.5, 78, {
    yields: { boiled: 2.6 },
    measures: [volumeMeasure('glass', 1.0), volumeMeasure('tbsp', 1.0)],
    packSizes: [800, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('beans_dry', 'Фасоль сухая', 'legume', 298, 21.0, 2.0, 47.0, 165, {
    yields: { boiled: 2.5 },
    measures: [volumeMeasure('glass', 0.9), volumeMeasure('tbsp', 1.0)],
    packSizes: [450, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),

  // ───────────────── Хлеб ─────────────────
  p('bread_rye', 'Хлеб ржаной', 'bread', 214, 6.6, 1.2, 40.7, 128, {
    measures: [pieceMeasure(35, 'ломоть')],
    packSizes: [700],
    shelfLifeDays: 5,
    perishable: true,
    tags: ['vegan'],
  }),
  p('bread_wheat', 'Хлеб пшеничный', 'bread', 242, 7.6, 2.4, 48.6, 128, {
    measures: [pieceMeasure(30, 'ломоть')],
    packSizes: [600, 700],
    shelfLifeDays: 4,
    perishable: true,
    tags: ['vegan'],
  }),

  // ───────────────── Мясо и птица ─────────────────
  p('chicken_whole', 'Куры охлаждённые', 'meat', 191, 18.2, 13.0, 0.0, 214, {
    wasteRatio: 0.28,
    yields: { boiled: 0.62, fried: 0.7, baked: 0.72 },
    measures: [packMeasure(1000, 'тушка ≈1 кг')],
    packSizes: [1000, 1500, 2000],
    shelfLifeDays: 5,
    perishable: true,
  }),
  p('chicken_fillet', 'Филе куриное', 'meat', 113, 23.6, 1.9, 0.4, 420, {
    yields: { boiled: 0.63, fried: 0.7, baked: 0.72 },
    measures: [pieceMeasure(180, 'филе ≈180 г')],
    packSizes: [500, 700, 1000],
    shelfLifeDays: 4,
    perishable: true,
  }),
  p('chicken_leg', 'Окорочка куриные', 'meat', 185, 16.8, 13.0, 0.0, 245, {
    wasteRatio: 0.25,
    yields: { boiled: 0.62, fried: 0.68, baked: 0.7 },
    measures: [pieceMeasure(250, 'окорочок')],
    packSizes: [1000],
    shelfLifeDays: 5,
    perishable: true,
  }),
  p('pork', 'Свинина', 'meat', 259, 16.0, 21.6, 0.0, 435, {
    wasteRatio: 0.1,
    yields: { boiled: 0.6, fried: 0.63, stewed: 0.65 },
    packSizes: [1000],
    shelfLifeDays: 4,
    perishable: true,
  }),
  p('beef', 'Говядина', 'meat', 187, 18.9, 12.4, 0.0, 760, {
    wasteRatio: 0.12,
    yields: { boiled: 0.58, fried: 0.62, stewed: 0.62 },
    packSizes: [1000],
    shelfLifeDays: 4,
    perishable: true,
  }),
  p('mince', 'Фарш мясной', 'meat', 218, 17.0, 16.5, 0.0, 450, {
    yields: { fried: 0.7, stewed: 0.72 },
    packSizes: [400, 500, 1000],
    shelfLifeDays: 2,
    perishable: true,
  }),
  p('liver_chicken', 'Печень куриная', 'meat', 137, 20.4, 5.9, 0.7, 280, {
    yields: { boiled: 0.68, fried: 0.72 },
    packSizes: [500, 1000],
    shelfLifeDays: 3,
    perishable: true,
  }),
  p('sausages', 'Сосиски, сардельки', 'meat', 266, 10.4, 24.0, 1.6, 560, {
    measures: [pieceMeasure(50, 'шт')],
    packSizes: [400, 500],
    shelfLifeDays: 10,
    perishable: true,
  }),

  // ───────────────── Рыба ─────────────────
  p('fish_frozen', 'Рыба мороженая (минтай)', 'fish', 72, 15.9, 0.9, 0.0, 330, {
    wasteRatio: 0.3,
    yields: { boiled: 0.8, fried: 0.79, baked: 0.8 },
    packSizes: [800, 1000],
    shelfLifeDays: 90,
  }),
  p('herring', 'Сельдь солёная', 'fish', 217, 17.0, 16.4, 0.0, 380, {
    wasteRatio: 0.35,
    measures: [pieceMeasure(300, 'шт')],
    packSizes: [300, 500],
    shelfLifeDays: 20,
    perishable: true,
  }),

  // ───────────────── Молочное ─────────────────
  p('milk', 'Молоко пастеризованное 2.5%', 'dairy', 52, 2.9, 2.5, 4.8, 90, {
    measures: [volumeMeasure('glass', 1.03), packMeasure(900, 'пакет 0.9 л')],
    packSizes: [900, 1000],
    shelfLifeDays: 7,
    perishable: true,
    tags: ['vegetarian'],
  }),
  p('kefir', 'Кефир', 'dairy', 51, 3.0, 2.5, 4.0, 110, {
    measures: [volumeMeasure('glass', 1.03), packMeasure(900, 'пакет 0.9 л')],
    packSizes: [900, 1000],
    shelfLifeDays: 7,
    perishable: true,
    tags: ['vegetarian'],
  }),
  p('cottage_cheese', 'Творог 5%', 'dairy', 121, 16.0, 5.0, 3.0, 430, {
    measures: [packMeasure(200, 'пачка 200 г'), volumeMeasure('tbsp', 1.67)],
    packSizes: [180, 200, 400],
    shelfLifeDays: 5,
    perishable: true,
    tags: ['vegetarian'],
  }),
  p('sour_cream', 'Сметана 15%', 'dairy', 158, 2.6, 15.0, 3.0, 340, {
    measures: [volumeMeasure('tbsp', 1.67)],
    packSizes: [180, 200, 400],
    shelfLifeDays: 10,
    perishable: true,
    tags: ['vegetarian'],
  }),
  p('cheese', 'Сыр полутвёрдый', 'dairy', 350, 23.0, 28.0, 0.0, 970, {
    measures: [pieceMeasure(25, 'ломтик')],
    packSizes: [200, 300],
    shelfLifeDays: 20,
    perishable: true,
    tags: ['vegetarian'],
  }),
  p('butter', 'Масло сливочное 72.5%', 'fat', 661, 0.8, 72.5, 1.3, 1150, {
    measures: [volumeMeasure('tsp', 0.9), volumeMeasure('tbsp', 0.9)],
    packSizes: [180, 200],
    shelfLifeDays: 30,
    perishable: true,
    tags: ['vegetarian'],
  }),

  // ───────────────── Яйца ─────────────────
  p('eggs', 'Яйца куриные', 'egg', 157, 12.7, 11.5, 0.7, 96, {
    wasteRatio: 0.12,
    yields: { boiled: 0.9 },
    measures: [pieceMeasure(55, 'шт'), packMeasure(550, 'десяток')],
    packSizes: [550],
    shelfLifeDays: 25,
    perishable: true,
    tags: ['vegetarian'],
  }),

  // ───────────────── Овощи ─────────────────
  p('potato', 'Картофель', 'vegetable', 77, 2.0, 0.4, 16.3, 58, {
    wasteRatio: 0.25,
    yields: { boiled: 0.97, fried: 0.6, baked: 0.85 },
    measures: [pieceMeasure(100, 'шт средняя')],
    packSizes: [1000, 2500],
    shelfLifeDays: 60,
    tags: ['vegan', 'gluten-free'],
  }),
  p('cabbage', 'Капуста белокочанная', 'vegetable', 28, 1.8, 0.1, 4.7, 49, {
    wasteRatio: 0.2,
    yields: { boiled: 0.9, stewed: 0.85 },
    measures: [volumeMeasure('glass', 0.45, 'стакан шинкованной')],
    packSizes: [1000, 2000],
    shelfLifeDays: 30,
    tags: ['vegan', 'gluten-free'],
  }),
  p('carrot', 'Морковь', 'vegetable', 35, 1.3, 0.1, 6.9, 64, {
    wasteRatio: 0.2,
    yields: { boiled: 0.95, stewed: 0.85 },
    measures: [pieceMeasure(85, 'шт средняя')],
    packSizes: [1000],
    shelfLifeDays: 45,
    tags: ['vegan', 'gluten-free'],
  }),
  p('onion', 'Лук репчатый', 'vegetable', 41, 1.4, 0.2, 8.2, 57, {
    wasteRatio: 0.16,
    yields: { fried: 0.5, stewed: 0.7 },
    measures: [pieceMeasure(75, 'шт средняя')],
    packSizes: [1000],
    shelfLifeDays: 60,
    tags: ['vegan', 'gluten-free'],
  }),
  p('beet', 'Свёкла', 'vegetable', 42, 1.5, 0.1, 8.8, 57, {
    wasteRatio: 0.2,
    yields: { boiled: 0.95 },
    measures: [pieceMeasure(150, 'шт средняя')],
    packSizes: [1000],
    shelfLifeDays: 60,
    tags: ['vegan', 'gluten-free'],
  }),
  p('tomato', 'Помидоры', 'vegetable', 20, 1.1, 0.2, 3.8, 398, {
    wasteRatio: 0.05,
    measures: [pieceMeasure(120, 'шт средний')],
    packSizes: [500, 1000],
    shelfLifeDays: 7,
    perishable: true,
    tags: ['vegan', 'gluten-free'],
  }),
  p('cucumber', 'Огурцы', 'vegetable', 14, 0.8, 0.1, 2.5, 248, {
    wasteRatio: 0.05,
    measures: [pieceMeasure(100, 'шт средний')],
    packSizes: [500, 1000],
    shelfLifeDays: 7,
    perishable: true,
    tags: ['vegan', 'gluten-free'],
  }),

  // ───────────────── Фрукты ─────────────────
  p('apple', 'Яблоки', 'fruit', 47, 0.4, 0.4, 9.8, 210, {
    wasteRatio: 0.1,
    measures: [pieceMeasure(180, 'шт средний')],
    packSizes: [1000],
    shelfLifeDays: 20,
    tags: ['vegan', 'gluten-free'],
  }),
  p('banana', 'Бананы', 'fruit', 96, 1.5, 0.5, 21.8, 183, {
    wasteRatio: 0.35,
    measures: [pieceMeasure(150, 'шт')],
    packSizes: [1000],
    shelfLifeDays: 7,
    perishable: true,
    tags: ['vegan', 'gluten-free'],
  }),

  // ───────────────── Масла и прочее ─────────────────
  p('sunflower_oil', 'Масло подсолнечное', 'fat', 899, 0.0, 99.9, 0.0, 169, {
    measures: [volumeMeasure('tbsp', 0.92), volumeMeasure('tsp', 0.92)],
    packSizes: [900, 1000],
    shelfLifeDays: 180,
    tags: ['vegan', 'gluten-free'],
  }),
  p('sugar', 'Сахар-песок', 'sweet', 399, 0.0, 0.0, 99.8, 79, {
    measures: [volumeMeasure('glass', 0.8), volumeMeasure('tbsp', 1.67), volumeMeasure('tsp', 1.6)],
    packSizes: [900, 1000],
    tags: ['vegan', 'gluten-free'],
  }),
  p('salt', 'Соль поваренная', 'other', 0, 0, 0, 0, 35, {
    measures: [volumeMeasure('tsp', 2.0), volumeMeasure('tbsp', 2.0)],
    packSizes: [1000],
    tags: ['vegan', 'gluten-free'],
  }),
  p('tea', 'Чай чёрный', 'other', 0, 0, 0, 0, 1284, {
    measures: [volumeMeasure('tsp', 0.4)],
    packSizes: [100, 200],
    tags: ['vegan'],
  }),
];

/** Индекс по id для быстрого доступа. */
export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((x) => [x.id, x]),
);

/** Продукты по категории. */
export function productsByCategory(category: Product['category']): Product[] {
  return PRODUCTS.filter((x) => x.category === category);
}
