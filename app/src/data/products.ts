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
  opts: Partial<Omit<Product, 'id' | 'name' | 'category' | 'per100g' | 'pricePerKg'>> & {
    /** Пищевые волокна, г на 100 г (Скурихин) */
    fiber?: number;
  } = {},
): Product {
  return {
    id,
    name,
    category,
    per100g: { kcal, protein, fat, carbs, fiber: opts.fiber ?? 0 },
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
    fiber: 11.3,
    yields: { boiled: 2.6 },
    measures: [volumeMeasure('glass', 1.05), volumeMeasure('tbsp', 1.0)],
    packSizes: [800, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('rice', 'Рис шлифованный', 'grain', 333, 7.0, 1.0, 74.0, 155, {
    fiber: 3.0,
    yields: { boiled: 2.8 },
    measures: [volumeMeasure('glass', 0.9), volumeMeasure('tbsp', 1.0)],
    packSizes: [800, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('millet', 'Пшено', 'grain', 348, 11.5, 3.3, 66.5, 82, {
    fiber: 3.6,
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 1.0), volumeMeasure('tbsp', 1.0)],
    packSizes: [800],
    shelfLifeDays: 300,
    tags: ['vegan', 'gluten-free'],
  }),
  p('oats', 'Овсяные хлопья «Геркулес»', 'grain', 352, 12.3, 6.2, 61.8, 110, {
    fiber: 6.0,
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 0.45), volumeMeasure('tbsp', 0.8)],
    packSizes: [500, 800],
    shelfLifeDays: 300,
    tags: ['vegan'],
  }),
  p('pearl_barley', 'Крупа перловая', 'grain', 315, 9.3, 1.1, 66.9, 68, {
    fiber: 7.8,
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 1.05), volumeMeasure('tbsp', 1.0)],
    packSizes: [800],
    shelfLifeDays: 480,
    tags: ['vegan'],
  }),
  p('pasta', 'Макароны из пшеницы в/с', 'grain', 344, 10.7, 1.3, 71.5, 168, {
    fiber: 3.7,
    yields: { boiled: 2.5 },
    measures: [packMeasure(100, 'горсть ≈100 г')],
    packSizes: [400, 450, 900],
    shelfLifeDays: 540,
    tags: ['vegan'],
  }),
  p('semolina', 'Крупа манная', 'grain', 333, 10.3, 1.0, 70.6, 78, {
    fiber: 3.6,
    yields: { boiled: 4.0 },
    measures: [volumeMeasure('glass', 0.8), volumeMeasure('tbsp', 1.0)],
    packSizes: [800],
    tags: ['vegan'],
  }),
  p('flour', 'Мука пшеничная', 'grain', 342, 10.3, 1.1, 70.6, 63, {
    fiber: 3.5,
    measures: [volumeMeasure('glass', 0.8), volumeMeasure('tbsp', 0.83)],
    packSizes: [1000, 2000],
    tags: ['vegan'],
  }),

  // ───────────────── Бобовые ─────────────────
  p('lentils', 'Чечевица', 'legume', 295, 24.0, 1.5, 46.3, 145, {
    fiber: 11.5,
    yields: { boiled: 2.5 },
    measures: [volumeMeasure('glass', 0.95), volumeMeasure('tbsp', 1.0)],
    packSizes: [450, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('peas_dry', 'Горох сухой', 'legume', 298, 20.5, 2.0, 49.5, 78, {
    fiber: 11.2,
    yields: { boiled: 2.6 },
    measures: [volumeMeasure('glass', 1.0), volumeMeasure('tbsp', 1.0)],
    packSizes: [800, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),
  p('beans_dry', 'Фасоль сухая', 'legume', 298, 21.0, 2.0, 47.0, 165, {
    fiber: 12.4,
    yields: { boiled: 2.5 },
    measures: [volumeMeasure('glass', 0.9), volumeMeasure('tbsp', 1.0)],
    packSizes: [450, 900],
    shelfLifeDays: 540,
    tags: ['vegan', 'gluten-free'],
  }),

  // ───────────────── Хлеб ─────────────────
  p('bread_rye', 'Хлеб ржаной', 'bread', 214, 6.6, 1.2, 40.7, 128, {
    fiber: 8.3,
    measures: [pieceMeasure(35, 'ломоть')],
    packSizes: [700],
    shelfLifeDays: 5,
    perishable: true,
    tags: ['vegan'],
  }),
  p('bread_wheat', 'Хлеб пшеничный', 'bread', 242, 7.6, 2.4, 48.6, 128, {
    fiber: 2.6,
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
    measures: [pieceMeasure(150, 'кусок ≈150 г')],
    packSizes: [1000],
    shelfLifeDays: 4,
    perishable: true,
  }),
  p('beef', 'Говядина', 'meat', 187, 18.9, 12.4, 0.0, 760, {
    wasteRatio: 0.12,
    yields: { boiled: 0.58, fried: 0.62, stewed: 0.62 },
    measures: [pieceMeasure(150, 'кусок ≈150 г')],
    packSizes: [1000],
    shelfLifeDays: 4,
    perishable: true,
  }),
  p('mince', 'Фарш мясной', 'meat', 218, 17.0, 16.5, 0.0, 450, {
    yields: { fried: 0.7, stewed: 0.72 },
    measures: [pieceMeasure(100, 'котлета ≈100 г'), packMeasure(400, 'пачка 400 г')],
    packSizes: [400, 500, 1000],
    shelfLifeDays: 2,
    perishable: true,
  }),
  p('liver_chicken', 'Печень куриная', 'meat', 137, 20.4, 5.9, 0.7, 280, {
    yields: { boiled: 0.68, fried: 0.72 },
    measures: [pieceMeasure(120, 'порция ≈120 г')],
    packSizes: [500, 1000],
    shelfLifeDays: 3,
    perishable: true,
  }),
  p('sausages', 'Сосиски, сардельки', 'meat', 266, 10.4, 24.0, 1.6, 560, {
    measures: [pieceMeasure(50, 'шт')],
    tags: ['processed'],
    packSizes: [400, 500],
    shelfLifeDays: 10,
    perishable: true,
  }),

  // ───────────────── Рыба ─────────────────
  p('fish_frozen', 'Рыба мороженая (минтай)', 'fish', 72, 15.9, 0.9, 0.0, 330, {
    wasteRatio: 0.3,
    yields: { boiled: 0.8, fried: 0.79, baked: 0.8 },
    measures: [pieceMeasure(150, 'филе ≈150 г')],
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
    tags: ['vegetarian', 'condiment'],
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
    tags: ['vegetarian', 'condiment'],
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
    fiber: 1.4,
    wasteRatio: 0.25,
    yields: { boiled: 0.97, fried: 0.6, baked: 0.85 },
    measures: [pieceMeasure(100, 'шт')],
    packSizes: [1000, 2500],
    shelfLifeDays: 60,
    tags: ['vegan', 'gluten-free'],
  }),
  p('cabbage', 'Капуста белокочанная', 'vegetable', 28, 1.8, 0.1, 4.7, 49, {
    fiber: 2.0,
    wasteRatio: 0.2,
    yields: { boiled: 0.9, stewed: 0.85 },
    measures: [volumeMeasure('glass', 0.45, 'стакан шинкованной')],
    packSizes: [1000, 2000],
    shelfLifeDays: 30,
    tags: ['vegan', 'gluten-free'],
  }),
  p('carrot', 'Морковь', 'vegetable', 35, 1.3, 0.1, 6.9, 64, {
    fiber: 2.4,
    wasteRatio: 0.2,
    yields: { boiled: 0.95, stewed: 0.85 },
    measures: [pieceMeasure(85, 'шт')],
    packSizes: [1000],
    shelfLifeDays: 45,
    tags: ['vegan', 'gluten-free'],
  }),
  p('onion', 'Лук репчатый', 'vegetable', 41, 1.4, 0.2, 8.2, 57, {
    fiber: 3.0,
    wasteRatio: 0.16,
    yields: { fried: 0.5, stewed: 0.7 },
    measures: [pieceMeasure(75, 'шт')],
    packSizes: [1000],
    shelfLifeDays: 60,
    tags: ['vegan', 'gluten-free'],
  }),
  p('beet', 'Свёкла', 'vegetable', 42, 1.5, 0.1, 8.8, 57, {
    fiber: 2.5,
    wasteRatio: 0.2,
    yields: { boiled: 0.95 },
    measures: [pieceMeasure(150, 'шт')],
    packSizes: [1000],
    shelfLifeDays: 60,
    tags: ['vegan', 'gluten-free'],
  }),
  p('tomato', 'Помидоры', 'vegetable', 20, 1.1, 0.2, 3.8, 398, {
    fiber: 1.2,
    wasteRatio: 0.05,
    measures: [pieceMeasure(120, 'шт')],
    packSizes: [500, 1000],
    shelfLifeDays: 7,
    perishable: true,
    tags: ['vegan', 'gluten-free'],
  }),
  p('cucumber', 'Огурцы', 'vegetable', 14, 0.8, 0.1, 2.5, 248, {
    fiber: 1.0,
    wasteRatio: 0.05,
    measures: [pieceMeasure(100, 'шт')],
    packSizes: [500, 1000],
    shelfLifeDays: 7,
    perishable: true,
    tags: ['vegan', 'gluten-free'],
  }),

  // ───────────────── Фрукты ─────────────────
  p('apple', 'Яблоки', 'fruit', 47, 0.4, 0.4, 9.8, 210, {
    fiber: 1.8,
    wasteRatio: 0.1,
    measures: [pieceMeasure(180, 'шт')],
    packSizes: [1000],
    shelfLifeDays: 20,
    tags: ['vegan', 'gluten-free'],
  }),
  p('banana', 'Бананы', 'fruit', 96, 1.5, 0.5, 21.8, 183, {
    fiber: 1.7,
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

  // ───────────────── Расширение базы ─────────────────
  p('barley_groats', 'Крупа ячневая', 'grain', 313, 10.0, 1.3, 65.4, 62, {
    fiber: 8.1,
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 1.0), volumeMeasure('tbsp', 1.0)],
    packSizes: [800], shelfLifeDays: 480, tags: ['vegan'],
  }),
  p('corn_groats', 'Крупа кукурузная', 'grain', 328, 8.3, 1.2, 71.0, 95, {
    fiber: 4.8,
    yields: { boiled: 3.5 },
    measures: [volumeMeasure('glass', 0.9), volumeMeasure('tbsp', 1.0)],
    packSizes: [700], tags: ['vegan', 'gluten-free'],
  }),
  p('buckwheat_flakes', 'Хлопья гречневые', 'grain', 330, 11.0, 3.0, 62.0, 130, {
    fiber: 9.0,
    yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 0.5)],
    packSizes: [400, 500], tags: ['vegan', 'gluten-free'],
  }),
  p('vermicelli', 'Вермишель', 'grain', 344, 10.7, 1.3, 71.5, 164, {
    fiber: 3.7,
    yields: { boiled: 2.5 },
    measures: [packMeasure(100, 'горсть ≈100 г')],
    packSizes: [400, 450], tags: ['vegan'],
  }),
  p('chickpeas', 'Нут', 'legume', 309, 20.1, 4.3, 46.2, 190, {
    fiber: 9.9,
    yields: { boiled: 2.4 },
    measures: [volumeMeasure('glass', 0.9), volumeMeasure('tbsp', 1.0)],
    packSizes: [450, 900], shelfLifeDays: 540, tags: ['vegan', 'gluten-free'],
  }),
  p('turkey', 'Индейка (филе)', 'meat', 138, 19.2, 7.0, 0.0, 480, {
    yields: { boiled: 0.62, fried: 0.7, baked: 0.72 },
    measures: [pieceMeasure(150, 'кусок ≈150 г')],
    packSizes: [500, 1000], shelfLifeDays: 4, perishable: true,
  }),
  p('chicken_wings', 'Крылья куриные', 'meat', 186, 19.2, 12.2, 0.0, 230, {
    wasteRatio: 0.32,
    yields: { baked: 0.7, fried: 0.68 },
    measures: [pieceMeasure(90, 'шт')],
    packSizes: [1000], shelfLifeDays: 5, perishable: true,
  }),
  p('herring_frozen', 'Скумбрия мороженая', 'fish', 191, 18.0, 13.2, 0.0, 320, {
    wasteRatio: 0.35,
    yields: { baked: 0.78, fried: 0.77 },
    measures: [pieceMeasure(300, 'тушка ≈300 г')],
    packSizes: [1000], shelfLifeDays: 90,
  }),
  p('hake', 'Хек мороженый', 'fish', 86, 16.6, 2.2, 0.0, 350, {
    wasteRatio: 0.3,
    yields: { boiled: 0.8, fried: 0.79 },
    measures: [pieceMeasure(150, 'филе ≈150 г')],
    packSizes: [800, 1000], shelfLifeDays: 90,
  }),
  p('ryazhenka', 'Ряженка', 'dairy', 54, 2.9, 2.5, 4.2, 130, {
    measures: [volumeMeasure('glass', 1.03), packMeasure(450, 'бутылка 450 г')],
    packSizes: [450, 900], shelfLifeDays: 7, perishable: true, tags: ['vegetarian'],
  }),
  p('yogurt', 'Йогурт натуральный', 'dairy', 66, 5.0, 3.2, 3.5, 260, {
    measures: [packMeasure(125, 'баночка 125 г'), volumeMeasure('glass', 1.03)],
    packSizes: [125, 250, 400], shelfLifeDays: 10, perishable: true, tags: ['vegetarian'],
  }),
  p('cottage_cheese_9', 'Творог 9%', 'dairy', 159, 16.7, 9.0, 2.0, 460, {
    measures: [packMeasure(200, 'пачка 200 г'), volumeMeasure('tbsp', 1.67)],
    packSizes: [180, 200, 400], shelfLifeDays: 5, perishable: true, tags: ['vegetarian'],
  }),
  p('pumpkin', 'Тыква', 'vegetable', 22, 1.0, 0.1, 4.4, 55, {
    fiber: 2.0, wasteRatio: 0.3,
    yields: { boiled: 0.9, baked: 0.8 },
    measures: [volumeMeasure('glass', 0.6, 'стакан кубиками')],
    packSizes: [1000], shelfLifeDays: 60, tags: ['vegan', 'gluten-free'],
  }),
  p('zucchini', 'Кабачок', 'vegetable', 24, 0.6, 0.3, 4.6, 120, {
    fiber: 1.0, wasteRatio: 0.2,
    yields: { fried: 0.6, stewed: 0.75 },
    measures: [pieceMeasure(250, 'шт')],
    packSizes: [1000], shelfLifeDays: 14, perishable: true, tags: ['vegan', 'gluten-free'],
  }),
  p('cabbage_sauer', 'Капуста квашеная', 'vegetable', 19, 1.8, 0.1, 3.2, 130, {
    fiber: 2.2,
    measures: [volumeMeasure('glass', 0.75)],
    packSizes: [500, 1000], shelfLifeDays: 30, perishable: true, tags: ['vegan', 'gluten-free'],
  }),
  p('green_peas_canned', 'Горошек зелёный консерв.', 'vegetable', 55, 3.6, 0.2, 9.8, 210, {
    fiber: 4.5,
    measures: [packMeasure(400, 'банка 400 г'), volumeMeasure('tbsp', 1.0)],
    packSizes: [400], shelfLifeDays: 365, tags: ['vegan', 'gluten-free'],
  }),
  p('pear', 'Груши', 'fruit', 42, 0.4, 0.3, 10.9, 220, {
    fiber: 2.8, wasteRatio: 0.1,
    measures: [pieceMeasure(170, 'шт')],
    packSizes: [1000], shelfLifeDays: 14, tags: ['vegan', 'gluten-free'],
  }),
  p('orange', 'Апельсины', 'fruit', 43, 0.9, 0.2, 8.1, 185, {
    fiber: 2.2, wasteRatio: 0.3,
    measures: [pieceMeasure(200, 'шт')],
    packSizes: [1000], shelfLifeDays: 20, tags: ['vegan', 'gluten-free'],
  }),
  p('dried_apricots', 'Курага', 'fruit', 232, 5.2, 0.3, 51.0, 620, {
    fiber: 18.0,
    measures: [pieceMeasure(8, 'шт'), volumeMeasure('glass', 0.65)],
    packSizes: [200, 500], shelfLifeDays: 180, tags: ['vegan', 'gluten-free'],
  }),
  p('sunflower_seeds', 'Семечки подсолнечника', 'nut', 601, 20.7, 52.9, 10.5, 340, {
    fiber: 5.0, wasteRatio: 0.4,
    measures: [volumeMeasure('tbsp', 0.7)],
    packSizes: [200, 500], tags: ['vegan', 'gluten-free'],
  }),
  p('peanuts', 'Арахис', 'nut', 552, 26.3, 45.2, 9.9, 420, {
    fiber: 8.1,
    measures: [volumeMeasure('tbsp', 0.6), volumeMeasure('glass', 0.7)],
    packSizes: [200, 500], tags: ['vegan', 'gluten-free'],
  }),
  p('honey', 'Мёд', 'sweet', 314, 0.8, 0.0, 80.3, 750, {
    measures: [volumeMeasure('tsp', 1.4), volumeMeasure('tbsp', 1.4)],
    packSizes: [250, 500], tags: ['vegetarian', 'condiment'],
  }),
  p('tomato_paste', 'Томатная паста', 'other', 82, 4.3, 0.5, 16.0, 290, {
    fiber: 1.1,
    measures: [volumeMeasure('tbsp', 1.6)],
    packSizes: [250, 500], shelfLifeDays: 30, tags: ['vegan', 'gluten-free', 'condiment'],
  }),
  // ───────────────── Расширение II: крупы и мука ─────────────────
  p('bulgur', 'Булгур', 'grain', 342, 12.3, 1.3, 63.4, 180, {
    fiber: 12.5, yields: { boiled: 2.8 },
    measures: [volumeMeasure('glass', 0.9), volumeMeasure('tbsp', 1.0)],
    packSizes: [350, 900], shelfLifeDays: 540, tags: ['vegan'],
  }),
  p('couscous', 'Кускус', 'grain', 376, 12.8, 0.6, 72.4, 210, {
    fiber: 5.0, yields: { boiled: 2.5 },
    measures: [volumeMeasure('glass', 0.85)],
    packSizes: [350, 500], shelfLifeDays: 540, tags: ['vegan'],
  }),
  p('oat_flakes_instant', 'Овсяные хлопья быстрые', 'grain', 350, 11.0, 6.5, 62.0, 130, {
    fiber: 5.5, yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 0.4)],
    packSizes: [400, 500], shelfLifeDays: 300, tags: ['vegan'],
  }),
  p('buckwheat_green', 'Гречка зелёная', 'grain', 310, 12.6, 3.3, 57.1, 195, {
    fiber: 11.3, yields: { boiled: 2.6 },
    measures: [volumeMeasure('glass', 1.0)],
    packSizes: [450, 900], shelfLifeDays: 540, tags: ['vegan', 'gluten-free'],
  }),
  p('rye_flour', 'Мука ржаная', 'grain', 298, 8.9, 1.7, 61.8, 72, {
    fiber: 12.4,
    measures: [volumeMeasure('glass', 0.75), volumeMeasure('tbsp', 0.8)],
    packSizes: [1000], tags: ['vegan'],
  }),
  p('bran', 'Отруби пшеничные', 'grain', 165, 15.1, 3.8, 23.5, 150, {
    fiber: 43.6,
    measures: [volumeMeasure('tbsp', 0.5)],
    packSizes: [200, 400], tags: ['vegan'],
  }),

  // ───────────────── Мясо и птица ─────────────────
  p('chicken_breast_bone', 'Грудка куриная на кости', 'meat', 137, 21.0, 5.5, 0.0, 320, {
    wasteRatio: 0.22, yields: { boiled: 0.62, baked: 0.72 },
    measures: [pieceMeasure(300, 'шт')],
    packSizes: [1000], shelfLifeDays: 5, perishable: true,
  }),
  p('beef_stew_meat', 'Говядина для тушения', 'meat', 187, 18.6, 12.6, 0.0, 690, {
    wasteRatio: 0.05, yields: { stewed: 0.62, boiled: 0.58 },
    measures: [pieceMeasure(150, 'кусок ≈150 г')],
    packSizes: [1000], shelfLifeDays: 4, perishable: true,
  }),
  p('pork_ribs', 'Свиные рёбра', 'meat', 278, 15.5, 24.0, 0.0, 390, {
    wasteRatio: 0.3, yields: { baked: 0.68, stewed: 0.65 },
    packSizes: [1000], shelfLifeDays: 4, perishable: true,
  }),
  p('liver_beef', 'Печень говяжья', 'meat', 127, 17.9, 3.7, 5.3, 340, {
    yields: { fried: 0.72, stewed: 0.7 },
    measures: [pieceMeasure(120, 'порция ≈120 г')],
    packSizes: [500, 1000], shelfLifeDays: 3, perishable: true,
  }),
  p('boiled_sausage', 'Колбаса варёная', 'meat', 257, 12.2, 22.8, 1.5, 528, {
    measures: [pieceMeasure(30, 'ломтик')],
    packSizes: [400, 500], shelfLifeDays: 10, perishable: true, tags: ['processed'],
  }),
  p('ham', 'Ветчина', 'meat', 209, 16.0, 16.0, 1.0, 620, {
    measures: [pieceMeasure(30, 'ломтик')],
    packSizes: [300, 500], shelfLifeDays: 10, perishable: true, tags: ['processed'],
  }),

  // ───────────────── Рыба ─────────────────
  p('pollock_fillet', 'Филе минтая', 'fish', 79, 17.6, 1.0, 0.0, 420, {
    yields: { boiled: 0.8, fried: 0.79, baked: 0.8 },
    measures: [pieceMeasure(150, 'филе ≈150 г')],
    packSizes: [500, 1000], shelfLifeDays: 90, tags: ['gluten-free'],
  }),
  p('salmon_trout', 'Форель', 'fish', 141, 20.5, 6.3, 0.0, 1150, {
    wasteRatio: 0.3, yields: { baked: 0.78, fried: 0.77 },
    measures: [pieceMeasure(150, 'стейк ≈150 г')],
    packSizes: [1000], shelfLifeDays: 4, perishable: true, tags: ['gluten-free'],
  }),
  p('capelin', 'Мойва', 'fish', 157, 13.4, 11.5, 0.0, 195, {
    wasteRatio: 0.25, yields: { fried: 0.75, baked: 0.78 },
    packSizes: [500, 1000], shelfLifeDays: 90, tags: ['gluten-free'],
  }),
  p('canned_saury', 'Сайра консервированная', 'fish', 283, 19.5, 23.3, 0.0, 380, {
    measures: [packMeasure(240, 'банка 240 г')],
    packSizes: [240], shelfLifeDays: 720, tags: ['gluten-free'],
  }),
  p('squid', 'Кальмар', 'fish', 100, 18.0, 2.2, 0.0, 550, {
    wasteRatio: 0.2, yields: { boiled: 0.65 },
    packSizes: [500, 1000], shelfLifeDays: 90, tags: ['gluten-free'],
  }),

  // ───────────────── Молочное ─────────────────
  p('milk_35', 'Молоко 3.2%', 'dairy', 60, 2.9, 3.2, 4.7, 95, {
    measures: [volumeMeasure('glass', 1.03), packMeasure(900, 'пакет 0.9 л')],
    packSizes: [900, 1000], shelfLifeDays: 7, perishable: true, tags: ['vegetarian'],
  }),
  p('yogurt_drink', 'Питьевой йогурт', 'dairy', 68, 2.8, 1.6, 10.8, 190, {
    measures: [packMeasure(290, 'бутылка 290 г')],
    packSizes: [290, 900], shelfLifeDays: 14, perishable: true, tags: ['vegetarian'],
  }),
  p('cheese_adygei', 'Сыр адыгейский', 'dairy', 240, 19.0, 19.8, 1.5, 720, {
    measures: [pieceMeasure(50, 'ломтик')],
    packSizes: [300, 400], shelfLifeDays: 10, perishable: true, tags: ['vegetarian'],
  }),
  p('condensed_milk', 'Сгущённое молоко', 'dairy', 320, 7.2, 8.5, 56.0, 340, {
    measures: [volumeMeasure('tbsp', 1.3)],
    packSizes: [370], shelfLifeDays: 30, tags: ['vegetarian', 'condiment'],
  }),
  p('cream_10', 'Сливки 10%', 'dairy', 118, 3.0, 10.0, 4.0, 340, {
    measures: [volumeMeasure('tbsp', 1.0)],
    packSizes: [200, 500], shelfLifeDays: 7, perishable: true, tags: ['vegetarian', 'condiment'],
  }),
  p('processed_cheese', 'Плавленый сыр', 'dairy', 257, 11.0, 22.0, 3.0, 560, {
    measures: [volumeMeasure('tbsp', 1.2)],
    packSizes: [180, 400], shelfLifeDays: 20, perishable: true, tags: ['vegetarian', 'condiment'],
  }),

  // ───────────────── Овощи ─────────────────
  p('bell_pepper', 'Перец сладкий', 'vegetable', 27, 1.3, 0.1, 5.3, 320, {
    fiber: 1.9, wasteRatio: 0.25, yields: { stewed: 0.75, baked: 0.7 },
    measures: [pieceMeasure(140, 'шт')],
    packSizes: [500, 1000], shelfLifeDays: 10, perishable: true, tags: ['vegan', 'gluten-free'],
  }),
  p('eggplant', 'Баклажан', 'vegetable', 24, 1.2, 0.1, 4.5, 260, {
    fiber: 2.5, wasteRatio: 0.1, yields: { fried: 0.6, baked: 0.7, stewed: 0.75 },
    measures: [pieceMeasure(250, 'шт')],
    packSizes: [1000], shelfLifeDays: 10, perishable: true, tags: ['vegan', 'gluten-free'],
  }),
  p('cauliflower', 'Капуста цветная', 'vegetable', 30, 2.5, 0.3, 4.2, 240, {
    fiber: 2.1, wasteRatio: 0.25, yields: { boiled: 0.9, fried: 0.7 },
    measures: [volumeMeasure('glass', 0.5)],
    packSizes: [1000], shelfLifeDays: 10, perishable: true, tags: ['vegan', 'gluten-free'],
  }),
  p('broccoli', 'Брокколи', 'vegetable', 34, 2.8, 0.4, 4.0, 380, {
    fiber: 2.6, wasteRatio: 0.2, yields: { boiled: 0.9 },
    measures: [volumeMeasure('glass', 0.5)],
    packSizes: [400, 1000], shelfLifeDays: 90, tags: ['vegan', 'gluten-free'],
  }),
  p('frozen_veg_mix', 'Овощная смесь замороженная', 'vegetable', 55, 2.4, 0.3, 10.5, 180, {
    fiber: 3.0, yields: { boiled: 0.95, fried: 0.85 },
    measures: [volumeMeasure('glass', 0.7)],
    packSizes: [400, 800], shelfLifeDays: 180, tags: ['vegan', 'gluten-free'],
  }),
  p('radish', 'Редис', 'vegetable', 20, 1.2, 0.1, 3.4, 220, {
    fiber: 1.6, wasteRatio: 0.2,
    measures: [pieceMeasure(20, 'шт')],
    packSizes: [500], shelfLifeDays: 10, perishable: true, tags: ['vegan', 'gluten-free'],
  }),
  p('greens', 'Зелень (укроп, петрушка)', 'vegetable', 38, 2.6, 0.5, 6.3, 700, {
    fiber: 2.8, wasteRatio: 0.2,
    measures: [volumeMeasure('tbsp', 0.25)],
    packSizes: [50, 100], shelfLifeDays: 7, perishable: true,
    tags: ['vegan', 'gluten-free', 'condiment'],
  }),
  p('garlic', 'Чеснок', 'vegetable', 149, 6.5, 0.5, 29.9, 420, {
    fiber: 1.5, wasteRatio: 0.22,
    measures: [pieceMeasure(5, 'зубчик')],
    packSizes: [200, 500], shelfLifeDays: 90, tags: ['vegan', 'gluten-free', 'condiment'],
  }),
  p('pickled_cucumber', 'Огурцы солёные', 'vegetable', 11, 0.8, 0.1, 1.7, 220, {
    fiber: 0.8,
    measures: [pieceMeasure(80, 'шт')],
    packSizes: [500, 1000], shelfLifeDays: 90, tags: ['vegan', 'gluten-free'],
  }),
  p('corn_canned', 'Кукуруза консервированная', 'vegetable', 58, 2.2, 0.4, 11.2, 230, {
    fiber: 2.4,
    measures: [packMeasure(340, 'банка 340 г'), volumeMeasure('tbsp', 1.0)],
    packSizes: [340], shelfLifeDays: 365, tags: ['vegan', 'gluten-free'],
  }),
  p('mushrooms', 'Шампиньоны', 'vegetable', 27, 4.3, 1.0, 0.1, 320, {
    fiber: 2.6, wasteRatio: 0.05, yields: { fried: 0.5, stewed: 0.6 },
    measures: [volumeMeasure('glass', 0.5)],
    packSizes: [400, 500], shelfLifeDays: 7, perishable: true, tags: ['vegan', 'gluten-free'],
  }),

  // ───────────────── Фрукты и ягоды ─────────────────
  p('mandarin', 'Мандарины', 'fruit', 38, 0.8, 0.2, 7.5, 210, {
    fiber: 1.8, wasteRatio: 0.26,
    measures: [pieceMeasure(90, 'шт')],
    packSizes: [1000], shelfLifeDays: 14, tags: ['vegan', 'gluten-free'],
  }),
  p('kiwi', 'Киви', 'fruit', 47, 0.8, 0.4, 8.1, 320, {
    fiber: 3.8, wasteRatio: 0.2,
    measures: [pieceMeasure(90, 'шт')],
    packSizes: [1000], shelfLifeDays: 14, tags: ['vegan', 'gluten-free'],
  }),
  p('frozen_berries', 'Ягоды замороженные', 'fruit', 44, 0.8, 0.4, 8.6, 420, {
    fiber: 3.5,
    measures: [volumeMeasure('glass', 0.65)],
    packSizes: [300, 500], shelfLifeDays: 180, tags: ['vegan', 'gluten-free'],
  }),
  p('raisins', 'Изюм', 'fruit', 264, 2.9, 0.6, 66.0, 480, {
    fiber: 9.6,
    measures: [volumeMeasure('tbsp', 1.0)],
    packSizes: [200, 500], shelfLifeDays: 180, tags: ['vegan', 'gluten-free'],
  }),
  p('prunes', 'Чернослив', 'fruit', 231, 2.3, 0.7, 57.5, 490, {
    fiber: 9.0,
    measures: [pieceMeasure(10, 'шт')],
    packSizes: [200, 500], shelfLifeDays: 180, tags: ['vegan', 'gluten-free'],
  }),
  p('lemon', 'Лимон', 'fruit', 34, 0.9, 0.1, 3.0, 290, {
    fiber: 2.0, wasteRatio: 0.4,
    measures: [pieceMeasure(90, 'шт')],
    packSizes: [500], shelfLifeDays: 21, tags: ['vegan', 'gluten-free', 'condiment'],
  }),

  // ───────────────── Орехи ─────────────────
  p('walnuts', 'Грецкие орехи', 'nut', 654, 15.2, 65.2, 7.0, 890, {
    fiber: 6.7,
    measures: [volumeMeasure('tbsp', 0.6)],
    packSizes: [150, 300], shelfLifeDays: 180, tags: ['vegan', 'gluten-free'],
  }),
  p('pumpkin_seeds', 'Тыквенные семечки', 'nut', 559, 30.2, 49.1, 10.7, 620, {
    fiber: 6.0,
    measures: [volumeMeasure('tbsp', 0.6)],
    packSizes: [150, 300], shelfLifeDays: 180, tags: ['vegan', 'gluten-free'],
  }),

  // ───────────────── Бобовые и соя ─────────────────
  p('beans_canned', 'Фасоль консервированная', 'legume', 99, 6.7, 0.3, 17.4, 190, {
    fiber: 5.5,
    measures: [packMeasure(400, 'банка 400 г'), volumeMeasure('tbsp', 1.0)],
    packSizes: [400], shelfLifeDays: 720, tags: ['vegan', 'gluten-free'],
  }),
  p('soy_meat', 'Соевое мясо', 'legume', 295, 52.0, 1.0, 17.0, 260, {
    fiber: 13.0, yields: { boiled: 3.0 },
    measures: [volumeMeasure('glass', 0.35)],
    packSizes: [200, 400], shelfLifeDays: 365, tags: ['vegan'],
  }),

  // ───────────────── Прочее и приправы ─────────────────
  p('mayonnaise', 'Майонез', 'fat', 627, 0.3, 67.0, 3.7, 340, {
    measures: [volumeMeasure('tbsp', 1.0)],
    packSizes: [200, 400], shelfLifeDays: 60, tags: ['vegetarian', 'condiment'],
  }),
  p('olive_oil', 'Масло оливковое', 'fat', 898, 0.0, 99.8, 0.0, 890, {
    measures: [volumeMeasure('tbsp', 0.9)],
    packSizes: [500, 1000], shelfLifeDays: 365, tags: ['vegan', 'gluten-free'],
  }),
  p('ketchup', 'Кетчуп', 'other', 93, 1.8, 0.2, 21.0, 250, {
    measures: [volumeMeasure('tbsp', 1.5)],
    packSizes: [350, 500], shelfLifeDays: 60, tags: ['vegan', 'condiment'],
  }),
  p('coffee', 'Кофе молотый', 'other', 0, 0, 0, 0, 1450, {
    measures: [volumeMeasure('tsp', 0.6)],
    packSizes: [250], shelfLifeDays: 365, tags: ['vegan'],
  }),
  p('cocoa', 'Какао-порошок', 'other', 289, 24.2, 15.0, 10.2, 780, {
    fiber: 35.3,
    measures: [volumeMeasure('tsp', 0.5)],
    packSizes: [100, 250], shelfLifeDays: 365, tags: ['vegan'],
  }),
  p('cookies', 'Печенье', 'sweet', 417, 7.5, 11.8, 74.4, 349, {
    fiber: 2.0,
    measures: [pieceMeasure(15, 'шт')],
    packSizes: [200, 400], shelfLifeDays: 90, tags: ['vegetarian'],
  }),
  p('chocolate_dark', 'Шоколад тёмный', 'sweet', 539, 6.2, 35.4, 48.2, 980, {
    fiber: 7.4,
    measures: [pieceMeasure(10, 'долька')],
    packSizes: [90, 100], shelfLifeDays: 365, tags: ['vegetarian'],
  }),
  p('jam', 'Варенье', 'sweet', 271, 0.3, 0.1, 68.2, 420, {
    measures: [volumeMeasure('tsp', 1.4), volumeMeasure('tbsp', 1.4)],
    packSizes: [350, 500], shelfLifeDays: 60, tags: ['vegan', 'condiment'],
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
