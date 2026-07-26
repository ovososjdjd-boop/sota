/**
 * Система домашних мер: перевод граммов в понятные человеку единицы.
 *
 * Обоснование (docs/research/RESEARCH.md):
 * исследования показывают, что люди плохо ОЦЕНИВАЮТ существующую порцию
 * (ошибка 25-50%), но хорошо ИСПОЛНЯЮТ предписание «положи 1 стакан».
 * Мы всегда предписываем, поэтому меры работают.
 *
 * Правила:
 *  1) стандартизируем меру («стакан 200 мл», «ложка без горки»);
 *  2) предпочитаем штучные меры — там ошибки нет вообще;
 *  3) показываем диапазоны, а не ложную точность;
 *  4) не дробим неделимое (пол-яйца не бывает).
 */

import type { HouseholdMeasure, MeasureKind, Product } from './types';
import { MEASURE_RELIABILITY } from './types';

/** Стандартные объёмные меры (мл). Зафиксированы, чтобы не было разночтений. */
export const STANDARD_VOLUMES = {
  glass: 200,
  tbsp: 15,
  tsp: 5,
} as const;

/**
 * Допустимые дробные доли меры. Человек уверенно отмеряет половину
 * и четверть стакана, но не «0.37 стакана».
 */
const FRACTIONS = [0.25, 0.5, 0.75];

export interface MeasureQuantity {
  measure: HouseholdMeasure;
  /** Количество единиц (может быть дробным для делимых мер) */
  units: number;
  /** Итоговая масса, г */
  grams: number;
  /** Насколько отличается от запрошенной массы, доля */
  relativeError: number;
  /** Текст для UI: «2 стакана», «1½ ст. л.», «3 шт» */
  text: string;
}

/** Красивая запись дробных количеств. */
export function formatUnits(units: number): string {
  const whole = Math.floor(units);
  const frac = units - whole;

  const fracSymbol =
    Math.abs(frac - 0.25) < 0.01
      ? '¼'
      : Math.abs(frac - 0.5) < 0.01
        ? '½'
        : Math.abs(frac - 0.75) < 0.01
          ? '¾'
          : '';

  if (fracSymbol) {
    return whole === 0 ? fracSymbol : `${whole}${fracSymbol}`;
  }
  if (Number.isInteger(units)) return String(units);
  return units.toFixed(1);
}

/**
 * Подобрать лучшую домашнюю меру для заданной массы.
 * Баланс: точность попадания × надёжность меры × «круглость» числа.
 */
export function pickMeasure(
  product: Product,
  targetGrams: number,
): MeasureQuantity | null {
  if (targetGrams <= 0 || product.measures.length === 0) return null;

  let best: MeasureQuantity | null = null;
  let bestScore = -Infinity;

  for (const measure of product.measures) {
    const raw = targetGrams / measure.grams;

    // кандидаты: целые числа и, если мера делима, дробные доли
    const candidates: number[] = [];
    const lo = Math.floor(raw);
    const hi = Math.ceil(raw);
    for (const n of [lo, hi]) if (n >= 1) candidates.push(n);
    if (measure.divisible) {
      for (const f of FRACTIONS) {
        const c = lo + f;
        if (c > 0) candidates.push(c);
      }
      if (raw < 1) for (const f of FRACTIONS) candidates.push(f);
    }
    if (candidates.length === 0) continue;

    for (const units of candidates) {
      const grams = units * measure.grams;
      const relativeError = Math.abs(grams - targetGrams) / targetGrams;

      // штраф за слишком большое число единиц: «17 ложек» неудобно
      const bulkPenalty = units > 12 ? (units - 12) * 0.02 : 0;
      // бонус за круглые числа
      const roundBonus = Number.isInteger(units) ? 0.05 : 0;

      const score =
        MEASURE_RELIABILITY[measure.kind] * 1.0 -
        relativeError * 2.0 -
        bulkPenalty +
        roundBonus;

      if (score > bestScore) {
        bestScore = score;
        best = {
          measure,
          units,
          grams,
          relativeError,
          text: `${formatUnits(units)} ${measure.label}`,
        };
      }
    }
  }

  return best;
}

/**
 * Человекочитаемый диапазон вместо точного числа.
 * Отражает реальную точность и снижает тревожность пользователя.
 */
export function formatRange(q: MeasureQuantity): string {
  if (q.measure.kind === 'piece' || q.measure.kind === 'pack') {
    return q.text; // штуки точны, диапазон не нужен
  }
  const lo = q.units * 0.9;
  const hi = q.units * 1.1;
  if (Math.abs(hi - lo) < 0.3) return q.text;
  return `${formatUnits(Math.round(lo * 4) / 4)}–${formatUnits(
    Math.round(hi * 4) / 4,
  )} ${q.measure.label}`;
}

/** Создание стандартной объёмной меры по плотности продукта. */
export function volumeMeasure(
  kind: 'glass' | 'tbsp' | 'tsp',
  densityGPerMl: number,
  label?: string,
): HouseholdMeasure {
  const ml = STANDARD_VOLUMES[kind];
  const defaults: Record<typeof kind, string> = {
    glass: 'стакан (200 мл)',
    tbsp: 'ст. л. без горки',
    tsp: 'ч. л. без горки',
  };
  return {
    kind,
    grams: Math.round(ml * densityGPerMl),
    label: label ?? defaults[kind],
    divisible: true,
  };
}

/** Штучная мера. */
export function pieceMeasure(grams: number, label = 'шт'): HouseholdMeasure {
  return { kind: 'piece', grams, label, divisible: false };
}

/** Мера-упаковка. */
export function packMeasure(grams: number, label?: string): HouseholdMeasure {
  return {
    kind: 'pack',
    grams,
    label: label ?? `упак. ${grams} г`,
    divisible: false,
  };
}

/**
 * Пересчёт сырой массы в готовую и обратно.
 * Крупы набирают воду (коэффициент > 1), мясо теряет сок (< 1).
 */
export function cookedFromRaw(product: Product, rawGrams: number, method: keyof Product['yields']): number {
  const factor = product.yields[method] ?? 1;
  return rawGrams * factor;
}

export function rawFromCooked(product: Product, cookedGrams: number, method: keyof Product['yields']): number {
  const factor = product.yields[method] ?? 1;
  return cookedGrams / factor;
}

/**
 * Масса брутто (сколько купить) из массы нетто (сколько съесть).
 * Учитывает несъедобную часть: кожуру, кости, скорлупу.
 */
export function grossFromNet(product: Product, netGrams: number): number {
  return netGrams / (1 - product.wasteRatio);
}

/** Сколько упаковок купить, чтобы покрыть потребность. */
export function packsNeeded(product: Product, grossGrams: number): {
  packSize: number;
  packs: number;
  totalGrams: number;
  leftover: number;
} {
  if (product.packSizes.length === 0) {
    return {
      packSize: grossGrams,
      packs: 1,
      totalGrams: grossGrams,
      leftover: 0,
    };
  }

  // выбираем фасовку с минимальным остатком
  let best = {
    packSize: product.packSizes[0],
    packs: 1,
    totalGrams: product.packSizes[0],
    leftover: Infinity,
  };

  for (const size of product.packSizes) {
    const packs = Math.max(1, Math.ceil(grossGrams / size));
    const totalGrams = packs * size;
    const leftover = totalGrams - grossGrams;
    if (leftover < best.leftover) {
      best = { packSize: size, packs, totalGrams, leftover };
    }
  }
  return best;
}
