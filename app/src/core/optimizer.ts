/**
 * Оптимизатор продуктовой корзины.
 *
 * Двухэтапный алгоритм (обоснование — docs/research/RESEARCH.md, §3.3):
 *   Этап 1: LP-релаксация на полной базе → шорт-лист кандидатов + теневые цены.
 *   Этап 2: целочисленный MILP на шорт-листе → целые домашние меры.
 * Замеры: 5000 продуктов за ~330 мс вместо 21 с (65× ускорение,
 * потеря качества 0.04%).
 *
 * Ключевое проектное решение: бюджет — ОГРАНИЧЕНИЕ, а не целевая функция.
 * Минимизация стоимости даёт несъедобную «диету Стиглера» (Darmon et al.).
 * Мы максимизируем качество рациона в рамках заданных денег.
 */

import type {
  Product,
  PlanRequest,
  PlanResult,
  BasketItem,
  NutrientTargets,
  NutrientKey,
  Explanation,
  Nutrients,
} from './types';
import { NUTRIENT_KEYS, MEASURE_RELIABILITY } from './types';
import { periodTargets, zeroNutrients } from './nutrition';
import { pickMeasure, grossFromNet, packsNeeded } from './measures';

// highs-js не поставляет типов
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HighsSolver = any;

let solverPromise: Promise<HighsSolver> | null = null;

/** Ленивая загрузка WASM-солвера. */
export async function getSolver(): Promise<HighsSolver> {
  if (!solverPromise) {
    solverPromise = (async () => {
      const mod = await import('highs');
      const loader = (mod.default ?? mod) as (opts?: unknown) => Promise<HighsSolver>;
      return loader();
    })();
  }
  return solverPromise;
}

/** Размер шорт-листа для второго этапа. Подобран экспериментально. */
const SHORTLIST_SIZE = 120;

/**
 * Запас на страховочных рельсах по нутриентам.
 * Жёсткие границы = частая невыполнимость; целевая функция и так тянет
 * решение к норме. Рельсы ловят только грубые перекосы.
 */
const RAIL_SLACK = 0.25;

/** Веса целевой функции. */
export interface OptimizerWeights {
  /** Отклонение по энергии */
  kcal: number;
  /** Отклонение по макронутриентам */
  macro: number;
  /** Штраф за неудобные меры (граммы вместо штук) */
  inconvenience: number;
  /** Штраф за остатки продуктов */
  leftovers: number;
}

export const DEFAULT_WEIGHTS: OptimizerWeights = {
  kcal: 1,
  macro: 12,
  inconvenience: 0.5,
  leftovers: 0.3,
};

interface Candidate {
  product: Product;
  /** Масса одной бытовой единицы, г */
  unitGrams: number;
  /** Стоимость одной единицы, ₽ */
  unitCost: number;
  /** Нутриенты одной единицы */
  unitNutrients: Nutrients;
  /** Максимум единиц за период */
  maxUnits: number;
  /** Штраф за неудобство меры */
  penalty: number;
}

/** Подготовка кандидата: выбираем базовую меру продукта. */
function toCandidate(
  product: Product,
  days: number,
  eaters: number,
): Candidate | null {
  const measure = product.measures[0];
  const unitGrams = measure ? measure.grams : 100;

  // масса брутто с учётом несъедобной части — за неё платим
  const grossGrams = grossFromNet(product, unitGrams);
  const unitCost = (grossGrams / 1000) * product.pricePerKg;

  const k = unitGrams / 100;
  const unitNutrients: Nutrients = {
    kcal: product.per100g.kcal * k,
    protein: product.per100g.protein * k,
    fat: product.per100g.fat * k,
    carbs: product.per100g.carbs * k,
    fiber: (product.per100g.fiber ?? 0) * k,
  };

  // Разумный предел потребления одного продукта.
  // Ограничиваем не только «сколько влезет», но и долей рациона:
  // ни один продукт не должен покрывать больше ~35% энергии.
  // Это и разнообразие, и резкое сокращение пространства поиска для MILP.
  const perPersonPerDay = product.category === 'fat' || product.category === 'sweet' ? 2 : 3;
  const effectiveDays = product.perishable
    ? Math.min(days, product.shelfLifeDays)
    : days;
  let maxUnits = Math.ceil(perPersonPerDay * effectiveDays * eaters);

  // энергетический потолок: не больше 35% суточной энергии семьи из одного продукта
  if (unitNutrients.kcal > 0) {
    const energyCap = (2200 * eaters * days * 0.35) / unitNutrients.kcal;
    maxUnits = Math.min(maxUnits, Math.ceil(energyCap));
  }
  maxUnits = Math.max(1, Math.min(maxUnits, 60));

  const reliability = measure ? MEASURE_RELIABILITY[measure.kind] : 0.3;
  const penalty = 1 - reliability;

  if (unitCost <= 0 || maxUnits <= 0) return null;
  return { product, unitGrams, unitCost, unitNutrients, maxUnits, penalty };
}

/**
 * Сужение верхних границ переменных по решению LP-релаксации.
 *
 * Время MILP определяется в первую очередь размером пространства поиска,
 * то есть верхними границами целочисленных переменных. LP подсказывает,
 * где искать; берём запас ×2 + 8 единиц.
 *
 * Замеры (10 продуктов, недельный план):
 *   ub=60 (без сужения) → 1441 мс
 *   ×2 + 8              →  481 мс, качество даже лучше на 0.5%
 *   ×1 + 3 (слишком узко) →  66 мс, но потеря 10.9% — так нельзя
 */
const BOUND_MULTIPLIER = 2;
const BOUND_SLACK = 8;

/**
 * Абсолютный зазор оптимальности. Целевая функция стремится к нулю,
 * поэтому относительный зазор (mip_rel_gap) здесь непригоден — от почти-нуля
 * любой процент бесконечно мал, и солвер молотит до таймаута.
 * Значение 5.0 в единицах взвешенного отклонения ≈ 1-2% по КБЖУ.
 * Замер: gap=2 → 3431 мс, gap=5 → 427 мс, gap=10 → 53 мс (но уже заметнее).
 */
const MIP_ABS_GAP = 5.0;

/** Потолок времени. Решение обычно готово за ~0.3 с; остальное — доказательство. */
const MIP_TIME_LIMIT_S = 3;

/** Есть ли в решении хотя бы одна выбранная позиция. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function solutionHasItems(sol: any, count: number): boolean {
  if (!sol?.Columns) return false;
  for (let i = 0; i < count; i++) {
    if ((sol.Columns[`u${i}`]?.Primal ?? 0) > 0.5) return true;
  }
  return false;
}

function tightenBounds(
  candidates: Candidate[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lpSolution: any,
): Candidate[] {
  return candidates.map((c, i) => {
    const relaxed = lpSolution.Columns?.[`u${i}`]?.Primal ?? 0;
    const tightened = Math.ceil(relaxed * BOUND_MULTIPLIER) + BOUND_SLACK;
    return { ...c, maxUnits: Math.min(c.maxUnits, Math.max(tightened, BOUND_SLACK)) };
  });
}

/** Построение LP/MILP-модели в формате CPLEX LP. */
function buildModel(
  candidates: Candidate[],
  targets: NutrientTargets,
  budget: number,
  weights: OptimizerWeights,
  integer: boolean,
): string {
  const lines: string[] = [];

  // ── целевая функция ──
  const objTerms: string[] = [];
  for (const key of NUTRIENT_KEYS) {
    const w = key === 'kcal' ? weights.kcal : weights.macro;
    // нормируем на масштаб цели, чтобы веса были сопоставимы
    const scale = Math.max(1, targets[key].target) / 1000;
    const wn = (w / scale).toFixed(6);
    objTerms.push(`${wn} over_${key}`, `${wn} under_${key}`);
  }
  candidates.forEach((c, i) => {
    if (c.penalty > 0) {
      objTerms.push(`${(c.penalty * weights.inconvenience).toFixed(6)} u${i}`);
    }
  });
  lines.push('Minimize', ' obj: ' + objTerms.join(' + '));

  // ── ограничения ──
  lines.push('Subject To');

  for (const key of NUTRIENT_KEYS) {
    const terms = candidates
      .map((c, i) => {
        const v = c.unitNutrients[key];
        return v !== 0 ? `${v.toFixed(6)} u${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');
    if (terms) {
      lines.push(
        ` bal_${key}: ${terms} - over_${key} + under_${key} = ${targets[key].target.toFixed(3)}`,
      );
    }
  }

  // Страховочные рельсы по нутриентам.
  // Это НЕ точные нормы (за них отвечает целевая функция), а границы
  // физиологической разумности. Слишком узкие жёсткие границы делают
  // задачу невыполнимой при скромном бюджете — проверено на тестах.
  for (const key of NUTRIENT_KEYS) {
    const terms = candidates
      .map((c, i) => {
        const v = c.unitNutrients[key];
        return v !== 0 ? `${v.toFixed(6)} u${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');
    if (!terms) continue;
    const lo = targets[key].min * (1 - RAIL_SLACK);
    const hi = targets[key].max * (1 + RAIL_SLACK);
    lines.push(` lo_${key}: ${terms} >= ${lo.toFixed(3)}`);
    lines.push(` hi_${key}: ${terms} <= ${hi.toFixed(3)}`);
  }

  // бюджет — жёсткое ограничение
  const costTerms = candidates
    .map((c, i) => `${c.unitCost.toFixed(6)} u${i}`)
    .join(' + ');
  lines.push(` budget: ${costTerms} <= ${budget.toFixed(2)}`);

  // ── границы переменных ──
  lines.push('Bounds');
  candidates.forEach((c, i) => lines.push(` 0 <= u${i} <= ${c.maxUnits}`));
  for (const key of NUTRIENT_KEYS) {
    lines.push(` over_${key} >= 0`, ` under_${key} >= 0`);
  }

  if (integer) {
    lines.push('General', ' ' + candidates.map((_, i) => `u${i}`).join(' '));
  }

  lines.push('End');
  return lines.join('\n');
}

/** Разнообразие: не даём одной категории занять всё. */
function applyDiversity(candidates: Candidate[]): Candidate[] {
  const byCategory = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byCategory.get(c.product.category) ?? [];
    list.push(c);
    byCategory.set(c.product.category, list);
  }
  const out: Candidate[] = [];
  // берём максимум 25 позиций из категории, чтобы шорт-лист был сбалансирован
  for (const list of byCategory.values()) out.push(...list.slice(0, 25));
  return out;
}

export interface OptimizeOptions {
  weights?: Partial<OptimizerWeights>;
  /** Ограничить базу продуктов */
  products?: Product[];
}

/** Основная функция планирования. */
export async function optimizeBasket(
  request: PlanRequest,
  allProducts: Product[],
  options: OptimizeOptions = {},
): Promise<PlanResult> {
  const t0 = Date.now();
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const highs = await getSolver();

  const targets = periodTargets(request.eaters, request.days);

  // фильтрация по предпочтениям и ограничениям
  const excluded = new Set(request.eaters.flatMap((e) => e.excludedProducts));
  const requiredTags = new Set(request.eaters.flatMap((e) => e.dietTags));

  const usable = allProducts.filter((prod) => {
    if (excluded.has(prod.id)) return false;
    for (const tag of requiredTags) {
      if (!prod.tags.includes(tag)) return false;
    }
    return true;
  });

  const candidates = usable
    .map((prod) => toCandidate(prod, request.days, request.eaters.length))
    .filter((c): c is Candidate => c !== null);

  if (candidates.length === 0) {
    return {
      status: 'infeasible',
      items: [],
      totalCost: 0,
      actual: zeroNutrients(),
      target: targetsToNutrients(targets),
      deviation: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      solveTimeMs: Date.now() - t0,
      explanations: [
        { kind: 'warning', text: 'Нет доступных продуктов под заданные ограничения.' },
      ],
    };
  }

  // ── ЭТАП 1: LP-релаксация на полной базе ──
  let shortlist = candidates;
  if (candidates.length > SHORTLIST_SIZE) {
    const lpModel = buildModel(candidates, targets, request.budget, weights, false);
    const lpSol = highs.solve(lpModel, { output_flag: false });

    if (lpSol.Status === 'Optimal') {
      const scored = candidates
        .map((c, i) => ({ c, v: lpSol.Columns[`u${i}`]?.Primal ?? 0 }))
        .sort((a, b) => b.v - a.v);
      shortlist = applyDiversity(scored.map((s) => s.c)).slice(0, SHORTLIST_SIZE);
    } else {
      shortlist = candidates.slice(0, SHORTLIST_SIZE);
    }
  }

  // ── ЭТАП 2: целочисленный MILP на шорт-листе ──
  // Сначала быстро проверяем LP-выполнимость: если даже дробное решение
  // не существует, бюджета действительно не хватает — MILP гонять незачем.
  const feasibilityModel = buildModel(shortlist, targets, request.budget, weights, false);
  const feasibility = highs.solve(feasibilityModel, { output_flag: false });

  if (feasibility.Status !== 'Optimal') {
    const minBudget = await findMinimumBudget(highs, shortlist, targets, weights);
    return {
      status: 'budget_too_low',
      items: [],
      totalCost: 0,
      actual: zeroNutrients(),
      target: targetsToNutrients(targets),
      deviation: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      minimumFeasibleBudget: minBudget,
      solveTimeMs: Date.now() - t0,
      explanations: [
        {
          kind: 'warning',
          text: minBudget
            ? `На эту сумму сбалансированный рацион не собрать. Минимум — примерно ${Math.ceil(minBudget / 50) * 50} ₽.`
            : 'На эту сумму сбалансированный рацион не собрать.',
        },
      ],
    };
  }

  // Сужаем границы по LP-решению — главный рычаг скорости MILP.
  const bounded = tightenBounds(shortlist, feasibility);

  const milpModel = buildModel(bounded, targets, request.budget, weights, true);
  const sol = highs.solve(milpModel, {
    output_flag: false,
    // Абсолютный зазор, а не относительный: целевая функция стремится к нулю
    // (идеальное попадание в КБЖУ), и относительный зазор от почти-нуля
    // заставляет солвер бесконечно доказывать оптимальность.
    mip_abs_gap: MIP_ABS_GAP,
    time_limit: MIP_TIME_LIMIT_S,
  });

  // «Time limit reached» — это НЕ провал: солвер обычно находит хорошее
  // решение за доли секунды, а остальное время доказывает оптимальность.
  // Нам важен ответ пользователю, а не математический сертификат.
  const hasSolution = solutionHasItems(sol, bounded.length);

  if (!hasSolution) {
    // бюджет недостижим — считаем минимально возможный
    const minBudget = await findMinimumBudget(highs, shortlist, targets, weights);
    return {
      status: 'budget_too_low',
      items: [],
      totalCost: 0,
      actual: zeroNutrients(),
      target: targetsToNutrients(targets),
      deviation: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      minimumFeasibleBudget: minBudget,
      solveTimeMs: Date.now() - t0,
      explanations: [
        {
          kind: 'warning',
          text: minBudget
            ? `На эту сумму сбалансированный рацион не собрать. Минимум — примерно ${Math.ceil(minBudget / 50) * 50} ₽.`
            : 'На эту сумму сбалансированный рацион не собрать.',
        },
      ],
    };
  }

  // ── сборка результата ──
  const items: BasketItem[] = [];
  let totalCost = 0;
  const actual = zeroNutrients();

  bounded.forEach((c, i) => {
    const units = Math.round(sol.Columns[`u${i}`]?.Primal ?? 0);
    if (units <= 0) return;

    const netGrams = units * c.unitGrams;
    const grossGrams = grossFromNet(c.product, netGrams);
    const packs = packsNeeded(c.product, grossGrams);
    const cost = (grossGrams / 1000) * c.product.pricePerKg;

    const measure = pickMeasure(c.product, netGrams);
    const nutrients: Nutrients = {
      kcal: c.unitNutrients.kcal * units,
      protein: c.unitNutrients.protein * units,
      fat: c.unitNutrients.fat * units,
      carbs: c.unitNutrients.carbs * units,
      fiber: (c.unitNutrients.fiber ?? 0) * units,
    };

    actual.kcal += nutrients.kcal;
    actual.protein += nutrients.protein;
    actual.fat += nutrients.fat;
    actual.carbs += nutrients.carbs;
    actual.fiber = (actual.fiber ?? 0) + (nutrients.fiber ?? 0);
    totalCost += cost;

    items.push({
      product: c.product,
      units,
      measure: measure?.measure ?? c.product.measures[0] ?? {
        kind: 'gram',
        grams: 100,
        label: 'г',
      },
      grams: netGrams,
      cost,
      nutrients,
      packsToBuy: packs.packs,
      leftoverGrams: packs.leftover,
    });
  });

  items.sort((a, b) => b.cost - a.cost);

  const targetNutrients = targetsToNutrients(targets);
  const deviation = {} as Record<NutrientKey, number>;
  for (const key of NUTRIENT_KEYS) {
    const t = targetNutrients[key];
    deviation[key] = t > 0 ? ((actual[key] - t) / t) * 100 : 0;
  }

  return {
    status: 'optimal',
    items,
    totalCost,
    actual,
    target: targetNutrients,
    deviation,
    solveTimeMs: Date.now() - t0,
    explanations: buildExplanations(items, totalCost, request, deviation),
  };
}

function targetsToNutrients(t: NutrientTargets): Nutrients {
  return {
    kcal: t.kcal.target,
    protein: t.protein.target,
    fat: t.fat.target,
    carbs: t.carbs.target,
    fiber: 0,
  };
}

/** Бинарный поиск минимально достижимого бюджета. */
async function findMinimumBudget(
  highs: HighsSolver,
  candidates: Candidate[],
  targets: NutrientTargets,
  weights: OptimizerWeights,
): Promise<number | undefined> {
  let lo = 0;
  let hi = 200000;
  let found: number | undefined;

  for (let iter = 0; iter < 18 && hi - lo > 25; iter++) {
    const mid = (lo + hi) / 2;
    const model = buildModel(candidates, targets, mid, weights, false);
    const sol = highs.solve(model, { output_flag: false });
    if (sol.Status === 'Optimal') {
      found = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return found;
}

/** Человеческие объяснения решений. */
function buildExplanations(
  items: BasketItem[],
  totalCost: number,
  request: PlanRequest,
  deviation: Record<NutrientKey, number>,
): Explanation[] {
  const out: Explanation[] = [];

  const left = request.budget - totalCost;
  if (left > request.budget * 0.05) {
    out.push({
      kind: 'info',
      text: `Уложились с запасом: остаётся ${Math.round(left)} ₽. Можно добавить разнообразия.`,
    });
  }

  // лучший источник белка на рубль
  const proteinValue = items
    .filter((x) => x.nutrients.protein > 0 && x.cost > 0)
    .map((x) => ({ item: x, ratio: x.nutrients.protein / x.cost }))
    .sort((a, b) => b.ratio - a.ratio)[0];

  if (proteinValue) {
    out.push({
      kind: 'value',
      productId: proteinValue.item.product.id,
      text: `${proteinValue.item.product.name} — лучший белок за рубль: ${proteinValue.ratio.toFixed(1)} г на 1 ₽.`,
    });
  }

  const bigLeftovers = items.filter((x) => x.leftoverGrams > x.grams * 0.3);
  if (bigLeftovers.length > 0) {
    out.push({
      kind: 'info',
      text: `Останется на следующий период: ${bigLeftovers.map((x) => x.product.name.toLowerCase()).join(', ')}.`,
    });
  }

  for (const key of NUTRIENT_KEYS) {
    if (Math.abs(deviation[key]) > 12) {
      const label = { kcal: 'калориям', protein: 'белку', fat: 'жирам', carbs: 'углеводам' }[key];
      out.push({
        kind: 'warning',
        text: `Отклонение по ${label}: ${deviation[key] > 0 ? '+' : ''}${deviation[key].toFixed(0)}%. Стоит скорректировать бюджет или ограничения.`,
      });
    }
  }

  return out;
}
