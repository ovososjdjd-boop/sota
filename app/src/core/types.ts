/**
 * Ядро предметной области «Ратион».
 * Все типы — единый источник правды для движка и UI.
 */

// ─────────────────────────── Нутриенты ───────────────────────────

/** Ключевые нутриенты, по которым идёт оптимизация. */
export interface Nutrients {
  /** Энергия, ккал */
  kcal: number;
  /** Белки, г */
  protein: number;
  /** Жиры, г */
  fat: number;
  /** Углеводы, г */
  carbs: number;
  /** Пищевые волокна, г */
  fiber?: number;
}

export const NUTRIENT_KEYS = ['kcal', 'protein', 'fat', 'carbs'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

// ─────────────────────────── Домашние меры ───────────────────────────

/**
 * Тип бытовой меры. Порядок важен: чем выше в списке, тем точнее
 * человек воспроизводит меру (исследование Gibson 2016).
 */
export type MeasureKind =
  | 'piece' // штука — ошибки нет вообще
  | 'slice' // ломоть
  | 'pack' // упаковка целиком
  | 'glass' // стакан 200 мл
  | 'tbsp' // столовая ложка без горки
  | 'tsp' // чайная ложка без горки
  | 'gram'; // граммы — последнее средство

/** Насколько надёжно человек воспроизводит меру. Используется в оптимизаторе. */
export const MEASURE_RELIABILITY: Record<MeasureKind, number> = {
  piece: 1.0,
  slice: 0.95,
  pack: 1.0,
  glass: 0.85,
  tbsp: 0.8,
  tsp: 0.75,
  gram: 0.3, // штраф: требует весов
};

export const MEASURE_LABEL: Record<MeasureKind, string> = {
  piece: 'шт',
  slice: 'ломоть',
  pack: 'упак.',
  glass: 'стакан',
  tbsp: 'ст. л.',
  tsp: 'ч. л.',
  gram: 'г',
};

/** Домашняя мера продукта: сколько граммов в одной единице. */
export interface HouseholdMeasure {
  kind: MeasureKind;
  /** Масса одной единицы, г */
  grams: number;
  /** Человекочитаемое описание: «стакан 200 мл», «шт средняя» */
  label: string;
  /** Можно ли делить меру пополам (пол-стакана — да, пол-яйца — нет) */
  divisible?: boolean;
}

// ─────────────────────────── Продукты ───────────────────────────

export type ProductCategory =
  | 'grain' // крупы, макароны
  | 'bread' // хлеб, выпечка
  | 'meat' // мясо, птица
  | 'fish' // рыба, морепродукты
  | 'dairy' // молочное
  | 'egg' // яйца
  | 'vegetable' // овощи
  | 'fruit' // фрукты, ягоды
  | 'legume' // бобовые
  | 'nut' // орехи, семечки
  | 'fat' // масла, жиры
  | 'sweet' // сладкое
  | 'other';

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  grain: 'Крупы и макароны',
  bread: 'Хлеб',
  meat: 'Мясо и птица',
  fish: 'Рыба',
  dairy: 'Молочное',
  egg: 'Яйца',
  vegetable: 'Овощи',
  fruit: 'Фрукты',
  legume: 'Бобовые',
  nut: 'Орехи',
  fat: 'Масла',
  sweet: 'Сладкое',
  other: 'Прочее',
};

/** Способ кулинарной обработки — влияет на массу и КБЖУ. */
export type CookingMethod = 'raw' | 'boiled' | 'fried' | 'baked' | 'stewed';

/**
 * Коэффициент выхода: масса готового / масса сырого.
 * Крупы > 1 (набирают воду), мясо < 1 (теряет сок).
 * Источник: Скурихин, таблицы потерь при тепловой обработке.
 */
export type YieldFactors = Partial<Record<CookingMethod, number>>;

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  /** КБЖУ на 100 г съедобной части продукта в сыром виде */
  per100g: Nutrients;
  /** Цена, ₽ за кг (или за литр для жидкостей) */
  pricePerKg: number;
  /** Доля несъедобной части (кожура, кости): 0..1 */
  wasteRatio: number;
  /** Коэффициенты выхода при готовке */
  yields: YieldFactors;
  /** Домашние меры, отсортированы по удобству */
  measures: HouseholdMeasure[];
  /** Типовые фасовки в магазине, г */
  packSizes: number[];
  /** Срок хранения после вскрытия, дней */
  shelfLifeDays: number;
  /** Скоропортящийся — нельзя закупать надолго */
  perishable: boolean;
  /** Теги: vegan, vegetarian, gluten-free, lactose-free… */
  tags: string[];
  /** Откуда взяты данные */
  source: string;
}

// ─────────────────────────── Профиль едока ───────────────────────────

export type Sex = 'male' | 'female';

/**
 * Уровень физической активности (коэффициент к основному обмену).
 * Значения согласованы с МР 2.3.1.2432-08.
 */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'veryHigh';

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.4,
  light: 1.6,
  moderate: 1.75,
  high: 1.95,
  veryHigh: 2.2,
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: 'Сидячий образ жизни',
  light: 'Лёгкая активность',
  moderate: 'Умеренная активность',
  high: 'Высокая активность',
  veryHigh: 'Очень высокая',
};

export type Goal = 'lose' | 'maintain' | 'gain';

export const GOAL_LABEL: Record<Goal, string> = {
  lose: 'Снизить вес',
  maintain: 'Поддерживать',
  gain: 'Набрать',
};

export interface EaterProfile {
  id: string;
  name: string;
  sex: Sex;
  /** Возраст, полных лет */
  age: number;
  /** Рост, см */
  heightCm: number;
  /** Вес, кг */
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /** id продуктов, которые человек не ест */
  excludedProducts: string[];
  /** Теги-ограничения: vegan, no-lactose… */
  dietTags: string[];
}

// ─────────────────────────── Цели по нутриентам ───────────────────────────

export interface NutrientTarget {
  min: number;
  target: number;
  max: number;
}

export type NutrientTargets = Record<NutrientKey, NutrientTarget>;

// ─────────────────────────── План и результат ───────────────────────────

export interface PlanRequest {
  /** Бюджет на весь период, ₽ */
  budget: number;
  /** Длительность, дней */
  days: number;
  eaters: EaterProfile[];
  /** Продукты, уже имеющиеся дома: id → граммы */
  pantry?: Record<string, number>;
  /** Максимум времени на готовку в день, мин */
  maxCookingMinutes?: number;
}

/** Одна позиция закупки в домашних мерах. */
export interface BasketItem {
  product: Product;
  /** Количество бытовых единиц (целое) */
  units: number;
  /** Использованная мера */
  measure: HouseholdMeasure;
  /** Итоговая масса, г */
  grams: number;
  /** Стоимость, ₽ */
  cost: number;
  /** Вклад в нутриенты за период */
  nutrients: Nutrients;
  /** Сколько упаковок купить */
  packsToBuy: number;
  /** Остаток после периода, г */
  leftoverGrams: number;
}

export interface PlanResult {
  status: 'optimal' | 'infeasible' | 'budget_too_low';
  items: BasketItem[];
  /** Итоговая стоимость, ₽ */
  totalCost: number;
  /** Фактические нутриенты за период */
  actual: Nutrients;
  /** Целевые нутриенты за период */
  target: Nutrients;
  /** Отклонение по каждому нутриенту, % */
  deviation: Record<NutrientKey, number>;
  /** Минимально возможный бюджет, если запрошенный недостижим */
  minimumFeasibleBudget?: number;
  /** Время решения, мс */
  solveTimeMs: number;
  /** Объяснения решений */
  explanations: Explanation[];
}

export interface Explanation {
  kind: 'value' | 'warning' | 'info';
  text: string;
  productId?: string;
}
