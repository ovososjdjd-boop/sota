/**
 * Расчёт потребности в энергии и нутриентах.
 *
 * Основа — формула Mifflin-St Jeor (наиболее точная по систематическому
 * обзору Frankenfield et al., 2005) с коэффициентами активности
 * из МР 2.3.1.2432-08.
 *
 * ВАЖНО О ТОЧНОСТИ: формула попадает в ±10% от измеренного основного
 * обмена лишь у 56-82% людей, границы согласия ±300-450 ккал/сут.
 * Поэтому:
 *   1) все цели трактуются как диапазоны, а не точки;
 *   2) UI обязан показывать округлённые значения («≈2100 ккал»);
 *   3) гнаться за точностью до грамма бессмысленно.
 */

import type {
  EaterProfile,
  Nutrients,
  NutrientTargets,
  NutrientKey,
} from './types';
import { ACTIVITY_FACTOR } from './types';

/** Относительная погрешность прогноза энергии (доля). */
export const ENERGY_UNCERTAINTY = 0.1;

/**
 * Основной обмен (BMR), ккал/сут — формула Mifflin-St Jeor.
 * male:   10*вес + 6.25*рост − 5*возраст + 5
 * female: 10*вес + 6.25*рост − 5*возраст − 161
 */
export function basalMetabolicRate(p: EaterProfile): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

/** Суточный расход с учётом активности (TDEE), ккал/сут. */
export function totalEnergyExpenditure(p: EaterProfile): number {
  return basalMetabolicRate(p) * ACTIVITY_FACTOR[p.activity];
}

/** Поправка на цель: дефицит/профицит ~15%, безопасный диапазон. */
export function goalAdjustedEnergy(p: EaterProfile): number {
  const tdee = totalEnergyExpenditure(p);
  switch (p.goal) {
    case 'lose':
      return tdee * 0.85;
    case 'gain':
      return tdee * 1.15;
    default:
      return tdee;
  }
}

/**
 * Целевые макронутриенты на сутки для одного человека.
 *
 * Белок задаётся от массы тела (физиологически корректнее, чем от калорий):
 *   поддержание 1.2 г/кг, снижение веса 1.6 г/кг (сохранение мышц),
 *   набор 1.8 г/кг.
 * Жиры — не менее 0.8 г/кг (мембраны, гормоны), целевое 30% калорий.
 * Углеводы — остаток калорий.
 */
export function dailyTargets(p: EaterProfile): NutrientTargets {
  const kcal = goalAdjustedEnergy(p);

  const proteinPerKg = p.goal === 'lose' ? 1.6 : p.goal === 'gain' ? 1.8 : 1.2;
  const protein = proteinPerKg * p.weightKg;
  const proteinMin = 0.8 * p.weightKg; // физиологический минимум ВОЗ
  const proteinMax = 2.2 * p.weightKg; // верхняя разумная граница

  const fat = (kcal * 0.3) / 9;
  const fatMin = Math.max(0.8 * p.weightKg, (kcal * 0.2) / 9);
  const fatMax = (kcal * 0.35) / 9;

  const carbsKcal = kcal - protein * 4 - fat * 9;
  const carbs = Math.max(carbsKcal / 4, 50); // минимум для работы мозга

  const band = (v: number, rel: number) => ({
    min: v * (1 - rel),
    target: v,
    max: v * (1 + rel),
  });

  return {
    kcal: band(kcal, ENERGY_UNCERTAINTY),
    protein: { min: proteinMin, target: protein, max: proteinMax },
    fat: { min: fatMin, target: fat, max: fatMax },
    carbs: band(carbs, 0.2),
  };
}

/** Суммарные цели на всю семью за период. */
export function periodTargets(
  eaters: EaterProfile[],
  days: number,
): NutrientTargets {
  const keys: NutrientKey[] = ['kcal', 'protein', 'fat', 'carbs'];
  const acc = {} as NutrientTargets;
  for (const k of keys) acc[k] = { min: 0, target: 0, max: 0 };

  for (const eater of eaters) {
    const t = dailyTargets(eater);
    for (const k of keys) {
      acc[k].min += t[k].min * days;
      acc[k].target += t[k].target * days;
      acc[k].max += t[k].max * days;
    }
  }
  return acc;
}

/** Пустой набор нутриентов. */
export function zeroNutrients(): Nutrients {
  return { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
}

/** Сложение нутриентов. */
export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
    fiber: (a.fiber ?? 0) + (b.fiber ?? 0),
  };
}

/** Масштабирование нутриентов (например, на массу порции). */
export function scaleNutrients(n: Nutrients, k: number): Nutrients {
  return {
    kcal: n.kcal * k,
    protein: n.protein * k,
    fat: n.fat * k,
    carbs: n.carbs * k,
    fiber: (n.fiber ?? 0) * k,
  };
}

/** Нутриенты для заданной массы продукта (граммы). */
export function nutrientsForGrams(per100g: Nutrients, grams: number): Nutrients {
  return scaleNutrients(per100g, grams / 100);
}

/**
 * Проверка энергетической согласованности: сумма макросов по Атуотеру
 * должна примерно совпадать с заявленной калорийностью.
 * Возвращает относительное расхождение.
 */
export function atwaterDiscrepancy(n: Nutrients): number {
  const computed = n.protein * 4 + n.fat * 9 + n.carbs * 4;
  if (n.kcal === 0) return computed === 0 ? 0 : 1;
  return Math.abs(computed - n.kcal) / n.kcal;
}
