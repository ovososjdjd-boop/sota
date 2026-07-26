/**
 * Кулинарные ограничения — то, что превращает математический оптимум
 * в еду, которую реально едят.
 *
 * ЗАЧЕМ ЭТО НУЖНО. Без ограничений оптимизатор выдал (реальный прогон):
 *   21 помидор, 21 банан, 8-10 стаканов сахара, сосиски и НОЛЬ круп.
 * Формально: калории и белок в норме, бюджет соблюдён.
 * Фактически: есть это невозможно.
 *
 * Это классическая «диета Стиглера» (1945): минимум муки, капусты и
 * шпината удовлетворяет нормам, но сам Стиглер писал — «никто не
 * рекомендует эти диеты никому». Darmon и Drewnowski подтвердили на
 * данных INCA: чистая оптимизация даёт рацион, резко отклоняющийся
 * от социальных норм питания.
 *
 * Решение: доли категорий в рационе, взятые из структуры реального
 * потребления, а не из математики.
 */

import type { ProductCategory } from './types';

/**
 * Доля категории в энергии рациона (от 0 до 1).
 * Ориентир — фактическая структура питания в России и рекомендации
 * по здоровому рациону. Это «рельсы нормальности», а не догма.
 */
export interface CategoryShare {
  /** Минимальная доля энергии из категории */
  minEnergyShare: number;
  /** Максимальная доля энергии */
  maxEnergyShare: number;
  /** Максимум граммов на человека в день (для абсолютных пределов) */
  maxGramsPerPersonDay?: number;
}

export const CATEGORY_RULES: Partial<Record<ProductCategory, CategoryShare>> = {
  // Крупы и макароны — основа рациона. Без них меню не бывает.
  grain: { minEnergyShare: 0.12, maxEnergyShare: 0.33 },

  // Хлеб — обязателен, но не половина рациона
  bread: { minEnergyShare: 0.05, maxEnergyShare: 0.2, maxGramsPerPersonDay: 300 },

  // Белковые группы: суммарно контролируются отдельно
  meat: { minEnergyShare: 0.05, maxEnergyShare: 0.3, maxGramsPerPersonDay: 300 },
  fish: { minEnergyShare: 0.02, maxEnergyShare: 0.18, maxGramsPerPersonDay: 200 },
  dairy: { minEnergyShare: 0.05, maxEnergyShare: 0.25 },
  egg: { minEnergyShare: 0, maxEnergyShare: 0.1, maxGramsPerPersonDay: 110 },
  legume: { minEnergyShare: 0, maxEnergyShare: 0.15 },

  // Овощи нужны каждый день, но помидоры по 21 штуке — нет
  vegetable: { minEnergyShare: 0.04, maxEnergyShare: 0.2, maxGramsPerPersonDay: 700 },
  fruit: { minEnergyShare: 0.02, maxEnergyShare: 0.15, maxGramsPerPersonDay: 400 },

  // Жиры: нужны, но строго ограничены
  fat: { minEnergyShare: 0.03, maxEnergyShare: 0.12, maxGramsPerPersonDay: 45 },

  // Сладкое — самое важное ограничение.
  // ВОЗ: свободные сахара менее 10% энергии, желательно менее 5%.
  sweet: { minEnergyShare: 0, maxEnergyShare: 0.05, maxGramsPerPersonDay: 30 },

  nut: { minEnergyShare: 0, maxEnergyShare: 0.1, maxGramsPerPersonDay: 50 },
  other: { minEnergyShare: 0, maxEnergyShare: 0.05 },
};

/**
 * Предельное количество одного продукта — чтобы не выходило
 * «21 помидор» даже внутри разрешённой доли категории.
 */
export interface ProductLimit {
  /** Максимум граммов одного продукта на человека в день */
  maxGramsPerPersonDay: number;
}

/** Пределы по категориям для отдельного продукта. */
export const PER_PRODUCT_LIMITS: Record<ProductCategory, ProductLimit> = {
  grain: { maxGramsPerPersonDay: 200 },
  bread: { maxGramsPerPersonDay: 200 },
  meat: { maxGramsPerPersonDay: 150 },
  fish: { maxGramsPerPersonDay: 150 },
  dairy: { maxGramsPerPersonDay: 400 },
  // приправы и добавки ограничиваются отдельно через condiment-тег
  egg: { maxGramsPerPersonDay: 110 },
  vegetable: { maxGramsPerPersonDay: 200 },
  fruit: { maxGramsPerPersonDay: 200 },
  legume: { maxGramsPerPersonDay: 120 },
  nut: { maxGramsPerPersonDay: 40 },
  fat: { maxGramsPerPersonDay: 40 },
  sweet: { maxGramsPerPersonDay: 40 },
  other: { maxGramsPerPersonDay: 30 },
};

/**
 * Группы, обеспечивающие белок. Хотя бы одна должна быть представлена
 * существенно — иначе получается «белок из хлеба», как в реальном прогоне.
 */
export const PROTEIN_CATEGORIES: ProductCategory[] = [
  'meat',
  'fish',
  'dairy',
  'egg',
  'legume',
];

/**
 * Минимальная доля белка, которая должна прийти из полноценных
 * белковых групп (не из круп и хлеба).
 */
export const MIN_QUALITY_PROTEIN_SHARE = 0.5;

/**
 * Клетчатка: норма ВОЗ и МР 2.3.1.2432 — около 25-30 г в сутки.
 * Реальный прогон без этого ограничения давал рацион, где клетчатка
 * вообще не учитывалась. Задаём как нижнюю границу, но мягко:
 * при скромном бюджете достичь нормы тяжело.
 */
export const FIBER_TARGET_PER_PERSON_DAY = 25;
export const FIBER_MIN_SHARE = 0.6;

/**
 * Овощи и фрукты: ВОЗ рекомендует не менее 400 г в сутки.
 * Это нижняя граница здорового рациона.
 */
export const PRODUCE_MIN_GRAMS_PER_PERSON_DAY = 350;

/**
 * Приправы и добавки: сметана, соусы, масло сливочное.
 * Помечаются тегом 'condiment'. Реальный прогон выдавал 46 столовых
 * ложек сметаны как основной молочный продукт — это добавка к блюду,
 * а не еда сама по себе.
 */
export const CONDIMENT_MAX_GRAMS_PER_PERSON_DAY = 30;

/** Группы-«основы», без которых меню не выглядит как еда. */
export const STAPLE_CATEGORIES: ProductCategory[] = ['grain', 'bread'];
