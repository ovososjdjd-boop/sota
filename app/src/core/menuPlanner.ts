/**
 * Планировщик меню целиком: от бюджета до расписания по дням.
 *
 * Декомпозиция Balintfy (1978):
 *   Фаза 1 — сколько порций каждого блюда нужно за период (LP → MILP)
 *   Фаза 2 — раскладка порций по дням и приёмам (core/menu.ts)
 *
 * Фаза 1 намеренно повторяет структуру продуктового оптимизатора:
 * та же двухэтапная схема, те же кулинарные ограничения, но кандидаты —
 * блюда, а не отдельные продукты. Энергия блюда распределена по категориям
 * его ингредиентов, поэтому все ограничения работают без изменений.
 */

import type {
  EaterProfile,
  Nutrients,
  NutrientKey,
  NutrientTargets,
  Product,
  ProductCategory,
  Explanation,
} from './types';
import { NUTRIENT_KEYS } from './types';
import { periodTargets, zeroNutrients } from './nutrition';
import {
  computeRecipeStats,
  hasExcluded,
  matchesDietTags,
  type DishRole,
  type Recipe,
  type RecipeStats,
} from './recipes';
import {
  CATEGORY_RULES,
  PROTEIN_CATEGORIES,
  MIN_QUALITY_PROTEIN_SHARE,
  FIBER_TARGET_PER_PERSON_DAY,
  FIBER_MIN_SHARE,
  PRODUCE_MIN_GRAMS_PER_PERSON_DAY,
} from './culinary';
import { getSolver } from './optimizer';
import {
  buildSchedule,
  assessSchedule,
  MIN_REPEAT_GAP_DAYS,
  type MenuSchedule,
  type DishDemand,
} from './menu';
import { PRODUCT_BY_ID } from '../data/products';

export interface MenuRequest {
  budget: number;
  days: number;
  eaters: EaterProfile[];
  /** Максимум времени готовки в день, мин */
  maxCookingMinutes?: number;
}

export interface MenuResult {
  status: 'optimal' | 'budget_too_low' | 'infeasible';
  schedule: MenuSchedule;
  /** Сколько порций каждого блюда за период */
  demands: DishDemand[];
  /** Суммарная потребность в продуктах: id → граммы (сырых, нетто) */
  products: Record<string, number>;
  totalCost: number;
  actual: Nutrients;
  target: Nutrients;
  deviation: Record<NutrientKey, number>;
  minimumFeasibleBudget?: number;
  solveTimeMs: number;
  explanations: Explanation[];
}

/** Кандидат фазы 1: блюдо с посчитанными характеристиками. */
interface DishCandidate {
  stats: RecipeStats;
  /** Максимум порций за период */
  maxPortions: number;
}

/**
 * Сколько порций блюда реально можно съесть за период.
 *
 * Ограничение диктуется правилом неповторения (СанПиН): блюдо подаётся
 * не чаще раза в 3 дня. За `days` дней это `days/3` подач, в каждую
 * съедает вся семья — значит `days/3 × eaters` порций.
 *
 * Раньше здесь стоял жёсткий потолок 60, из-за которого фаза 1 заказывала
 * 937 порций всего из 22 блюд — разложить такое расписание невозможно,
 * и у семьи из 4 оставались пустые приёмы. Теперь потолок согласован
 * с тем, что физически исполнимо в фазе 2.
 */
function maxPortionsFor(recipe: Recipe, days: number, eaters: number): number {
  const servings = Math.max(1, Math.floor(days / MIN_REPEAT_GAP_DAYS));
  // блюдо, пригодное и на обед, и на ужин, может появляться чаще
  const slotsFactor = recipe.slots.length >= 2 ? 1.4 : 1;
  return Math.max(1, Math.ceil(servings * slotsFactor * eaters));
}

function buildDishModel(
  candidates: DishCandidate[],
  targets: NutrientTargets,
  budget: number,
  personDays: number,
  integer: boolean,
  maxMinutesPerDay: number | undefined,
  days: number,
): string {
  const lines: string[] = [];
  const objTerms: string[] = [];

  for (const key of NUTRIENT_KEYS) {
    const w = key === 'kcal' ? 1 : 12;
    const scale = Math.max(1, targets[key].target) / 1000;
    const wn = (w / scale).toFixed(6);
    objTerms.push(`${wn} over_${key}`, `${wn} under_${key}`);
  }

  // мягкая бережливость — тай-брейк, не цель
  if (budget > 0) {
    const perRuble = 0.6 / budget;
    candidates.forEach((c, i) => {
      objTerms.push(`${(perRuble * c.stats.cost).toFixed(9)} x${i}`);
    });
  }

  // награда за качественный белок — на что тратится свободный бюджет
  const qScale = 45 / Math.max(1, targets.protein.target);
  candidates.forEach((c, i) => {
    let qp = 0;
    for (const cat of PROTEIN_CATEGORIES) {
      qp += c.stats.categoryKcal[cat] ? proteinFromCategory(c.stats, cat) : 0;
    }
    if (qp > 0) objTerms.push(`-${(qScale * qp).toFixed(9)} x${i}`);
  });

  lines.push('Minimize', ' obj: ' + objTerms.join(' + ').replace(/\+ -/g, '- '));
  lines.push('Subject To');

  // баланс нутриентов
  for (const key of NUTRIENT_KEYS) {
    const terms = candidates
      .map((c, i) => {
        const v = c.stats.nutrients[key] ?? 0;
        return v !== 0 ? `${v.toFixed(6)} x${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');
    if (terms) {
      lines.push(
        ` bal_${key}: ${terms} - over_${key} + under_${key} = ${targets[key].target.toFixed(3)}`,
      );
    }
  }

  // страховочные рельсы
  for (const key of NUTRIENT_KEYS) {
    const terms = candidates
      .map((c, i) => {
        const v = c.stats.nutrients[key] ?? 0;
        return v !== 0 ? `${v.toFixed(6)} x${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');
    if (!terms) continue;
    lines.push(` lo_${key}: ${terms} >= ${(targets[key].min * 0.75).toFixed(3)}`);
    lines.push(` hi_${key}: ${terms} <= ${(targets[key].max * 1.25).toFixed(3)}`);
  }

  // бюджет
  lines.push(
    ` budget: ` +
      candidates.map((c, i) => `${c.stats.cost.toFixed(6)} x${i}`).join(' + ') +
      ` <= ${budget.toFixed(2)}`,
  );

  // ── кулинарные ограничения на уровне категорий ингредиентов ──
  const totalKcal = targets.kcal.target;
  for (const [category, rule] of Object.entries(CATEGORY_RULES)) {
    if (!rule) continue;
    const terms = candidates
      .map((c, i) => {
        const v = c.stats.categoryKcal[category as ProductCategory] ?? 0;
        return v > 0 ? `${v.toFixed(6)} x${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');
    if (!terms) continue;

    if (rule.maxEnergyShare < 1) {
      lines.push(
        ` catmax_${category}: ${terms} <= ${(totalKcal * rule.maxEnergyShare).toFixed(2)}`,
      );
    }
    // Минимальные доли категорий НЕ переносятся на уровень блюд.
    // В продуктовой корзине «хлеб ≥5% энергии» осмысленно, но блюд,
    // состоящих из хлеба, почти нет — он входит в состав как добавка.
    // Требование делало задачу невыполнимой (нужно 1052 ккал, максимум 1041).
    // Разнообразие на уровне блюд обеспечивают ограничения по слотам
    // и качественному белку.
  }

  // качественный белок
  const qualityTerms = candidates
    .map((c, i) => {
      let p = 0;
      for (const cat of PROTEIN_CATEGORIES) p += proteinFromCategory(c.stats, cat);
      return p > 0 ? `${p.toFixed(6)} x${i}` : null;
    })
    .filter(Boolean)
    .join(' + ');
  if (qualityTerms) {
    lines.push(
      ` quality_protein: ${qualityTerms} >= ${(targets.protein.target * MIN_QUALITY_PROTEIN_SHARE).toFixed(2)}`,
    );
  }

  // клетчатка
  const fiberTerms = candidates
    .map((c, i) => {
      const v = c.stats.nutrients.fiber ?? 0;
      return v > 0 ? `${v.toFixed(6)} x${i}` : null;
    })
    .filter(Boolean)
    .join(' + ');
  if (fiberTerms) {
    lines.push(
      ` fiber_min: ${fiberTerms} >= ${(FIBER_TARGET_PER_PERSON_DAY * personDays * FIBER_MIN_SHARE).toFixed(2)}`,
    );
  }

  // овощи и фрукты
  const produceTerms = candidates
    .map((c, i) => {
      const v =
        (c.stats.categoryGrams.vegetable ?? 0) + (c.stats.categoryGrams.fruit ?? 0);
      return v > 0 ? `${v.toFixed(3)} x${i}` : null;
    })
    .filter(Boolean)
    .join(' + ');
  if (produceTerms) {
    lines.push(
      ` produce_min: ${produceTerms} >= ${(PRODUCE_MIN_GRAMS_PER_PERSON_DAY * personDays).toFixed(1)}`,
    );
  }

  // ── структура приёмов пищи ──
  // Фаза 2 не может разложить то, чего фаза 1 не заказала. Раньше здесь
  // стояло слабое «>= 70% человеко-дней» по блюдам, пригодным для слота, —
  // но одно и то же блюдо годится и на обед, и на ужин, поэтому счётчик
  // выполнялся, а реальных обедов не хватало. Итог: 5 пустых приёмов.
  //
  // Теперь требуем ЯДРО для каждого приёма: блюдо, которое может быть
  // его основой, — и ровно по числу человеко-дней.
  const CORE_ROLES: Record<'breakfast' | 'lunch' | 'dinner', DishRole[]> = {
    breakfast: ['porridge', 'main', 'bakery'],
    lunch: ['soup', 'main'],
    dinner: ['main', 'porridge'],
  };

  for (const [slot, roles] of Object.entries(CORE_ROLES) as [
    'breakfast' | 'lunch' | 'dinner',
    DishRole[],
  ][]) {
    const terms = candidates
      .map((c, i) =>
        c.stats.recipe.slots.includes(slot) && roles.includes(c.stats.recipe.role)
          ? `x${i}`
          : null,
      )
      .filter(Boolean)
      .join(' + ');
    if (terms) {
      lines.push(` core_${slot}: ${terms} >= ${personDays}`);
    }
  }

  // Обед и ужин делят одни и те же блюда: «макароны по-флотски» годятся
  // и туда, и туда. Раздельные ограничения по personDays каждое выполнялись
  // одним и тем же набором, и на практике одному из приёмов не хватало еды.
  // Требуем суммарный объём на оба приёма.
  const lunchDinnerTerms = candidates
    .map((c, i) => {
      const r = c.stats.recipe;
      const fits = r.slots.includes('lunch') || r.slots.includes('dinner');
      const isCore = r.role === 'soup' || r.role === 'main' || r.role === 'porridge';
      return fits && isCore ? `x${i}` : null;
    })
    .filter(Boolean)
    .join(' + ');
  if (lunchDinnerTerms) {
    lines.push(` core_lunch_dinner: ${lunchDinnerTerms} >= ${personDays * 2}`);
  }

  // Супы отдельно: обед без супа возможен, но не всю неделю подряд.
  const soupTerms = candidates
    .map((c, i) => (c.stats.recipe.role === 'soup' ? `x${i}` : null))
    .filter(Boolean)
    .join(' + ');
  if (soupTerms) {
    lines.push(` soup_min: ${soupTerms} >= ${Math.ceil(personDays * 0.4)}`);
  }

  // время готовки
  if (maxMinutesPerDay && maxMinutesPerDay > 0) {
    const timeTerms = candidates
      .map((c, i) => {
        // блюда с batch cooking готовятся не каждый раз
        const perPortion = c.stats.recipe.minutes / Math.max(1, c.stats.recipe.batchPortions);
        return `${perPortion.toFixed(4)} x${i}`;
      })
      .join(' + ');
    lines.push(` cook_time: ${timeTerms} <= ${(maxMinutesPerDay * days).toFixed(1)}`);
  }

  // Разнообразие: ни одно блюдо не даёт больше 12% энергии рациона.
  // Без этого солвер набирал 60 порций самого дешёвого блюда и обходился
  // 22 позициями из 51 — разложить такое в расписание невозможно,
  // и у больших семей оставались пустые приёмы.
  const maxDishShare = 0.12;
  candidates.forEach((c, i) => {
    const k = c.stats.nutrients.kcal;
    if (k > 0) {
      lines.push(
        ` var_${i}: ${k.toFixed(6)} x${i} <= ${(totalKcal * maxDishShare).toFixed(2)}`,
      );
    }
  });

  lines.push('Bounds');
  candidates.forEach((c, i) => lines.push(` 0 <= x${i} <= ${c.maxPortions}`));
  for (const key of NUTRIENT_KEYS) {
    lines.push(` over_${key} >= 0`, ` under_${key} >= 0`);
  }

  if (integer) {
    lines.push('General', ' ' + candidates.map((_, i) => `x${i}`).join(' '));
  }

  lines.push('End');
  return lines.join('\n');
}

/** Белок, приходящий из ингредиентов заданной категории. */
function proteinFromCategory(stats: RecipeStats, category: ProductCategory): number {
  let protein = 0;
  for (const ing of stats.recipe.ingredients) {
    const product = PRODUCT_BY_ID[ing.productId];
    if (product?.category === category) {
      protein += (product.per100g.protein * ing.grams) / 100;
    }
  }
  return protein;
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

/** Основная функция: строит меню на период под заданный бюджет. */
export async function planMenu(
  request: MenuRequest,
  recipes: Recipe[],
  products: Record<string, Product> = PRODUCT_BY_ID,
  excludedProducts: Set<string> = new Set(),
): Promise<MenuResult> {
  const t0 = Date.now();
  const highs = await getSolver();

  const targets = periodTargets(request.eaters, request.days);
  const personDays = request.days * request.eaters.length;

  const dietTags = [...new Set(request.eaters.flatMap((e) => e.dietTags))];
  const allExcluded = new Set([
    ...excludedProducts,
    ...request.eaters.flatMap((e) => e.excludedProducts),
  ]);

  // ── подготовка кандидатов ──
  const candidates: DishCandidate[] = [];
  for (const recipe of recipes) {
    if (hasExcluded(recipe, allExcluded)) continue;
    const stats = computeRecipeStats(recipe, products);
    if (!stats.valid || stats.nutrients.kcal <= 0) continue;
    if (!matchesDietTags(stats, dietTags, products)) continue;
    candidates.push({
      stats,
      maxPortions: maxPortionsFor(recipe, request.days, request.eaters.length),
    });
  }

  const emptyResult = (
    status: MenuResult['status'],
    explanations: Explanation[],
    minimumFeasibleBudget?: number,
  ): MenuResult => ({
    status,
    schedule: { days: [], unplaced: [], notes: [] },
    demands: [],
    products: {},
    totalCost: 0,
    actual: zeroNutrients(),
    target: targetsToNutrients(targets),
    deviation: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    minimumFeasibleBudget,
    solveTimeMs: Date.now() - t0,
    explanations,
  });

  if (candidates.length === 0) {
    return emptyResult('infeasible', [
      { kind: 'warning', text: 'Под заданные ограничения не нашлось ни одного блюда.' },
    ]);
  }

  // ── фаза 1: сколько порций каждого блюда ──
  const lpModel = buildDishModel(
    candidates,
    targets,
    request.budget,
    personDays,
    false,
    request.maxCookingMinutes,
    request.days,
  );
  const lp = highs.solve(lpModel, { output_flag: false });

  if (lp.Status !== 'Optimal') {
    const minBudget = findMinBudget(
      highs,
      candidates,
      targets,
      personDays,
      request,
    );
    return emptyResult(
      'budget_too_low',
      [
        {
          kind: 'warning',
          text: minBudget
            ? `На эту сумму меню не собрать. Минимум — примерно ${Math.ceil(minBudget / 50) * 50} ₽.`
            : 'На эту сумму меню не собрать.',
        },
      ],
      minBudget,
    );
  }

  // сужение границ по LP — тот же приём, что и в продуктовом оптимизаторе
  const bounded = candidates.map((c, i) => ({
    ...c,
    maxPortions: Math.min(
      c.maxPortions,
      Math.max(Math.ceil((lp.Columns?.[`x${i}`]?.Primal ?? 0) * 2) + 6, 6),
    ),
  }));

  const milpModel = buildDishModel(
    bounded,
    targets,
    request.budget,
    personDays,
    true,
    request.maxCookingMinutes,
    request.days,
  );
  const sol = highs.solve(milpModel, {
    output_flag: false,
    mip_abs_gap: 5,
    time_limit: 4,
  });

  // ── сборка результата фазы 1 ──
  const demands: DishDemand[] = [];
  const actual = zeroNutrients();
  const productNeeds: Record<string, number> = {};
  let totalCost = 0;

  bounded.forEach((c, i) => {
    const portions = Math.round(sol.Columns?.[`x${i}`]?.Primal ?? 0);
    if (portions <= 0) return;

    demands.push({ stats: c.stats, portions });
    totalCost += c.stats.cost * portions;

    actual.kcal += c.stats.nutrients.kcal * portions;
    actual.protein += c.stats.nutrients.protein * portions;
    actual.fat += c.stats.nutrients.fat * portions;
    actual.carbs += c.stats.nutrients.carbs * portions;
    actual.fiber = (actual.fiber ?? 0) + (c.stats.nutrients.fiber ?? 0) * portions;

    for (const ing of c.stats.recipe.ingredients) {
      productNeeds[ing.productId] = (productNeeds[ing.productId] ?? 0) + ing.grams * portions;
    }
  });

  if (demands.length === 0) {
    const minBudget = findMinBudget(highs, candidates, targets, personDays, request);
    return emptyResult(
      'budget_too_low',
      [
        {
          kind: 'warning',
          text: minBudget
            ? `На эту сумму меню не собрать. Минимум — примерно ${Math.ceil(minBudget / 50) * 50} ₽.`
            : 'На эту сумму меню не собрать.',
        },
      ],
      minBudget,
    );
  }

  // ── фаза 2: расписание по дням ──
  const dailyKcal = targets.kcal.target / request.days;
  const schedule = buildSchedule(demands, request.days, request.eaters.length, dailyKcal);

  const targetNutrients = targetsToNutrients(targets);
  const deviation = {} as Record<NutrientKey, number>;
  for (const key of NUTRIENT_KEYS) {
    const t = targetNutrients[key];
    deviation[key] = t > 0 ? ((actual[key] - t) / t) * 100 : 0;
  }

  return {
    status: 'optimal',
    schedule,
    demands,
    products: productNeeds,
    totalCost,
    actual,
    target: targetNutrients,
    deviation,
    solveTimeMs: Date.now() - t0,
    explanations: explain(schedule, demands, totalCost, request, deviation),
  };
}

function findMinBudget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highs: any,
  candidates: DishCandidate[],
  targets: NutrientTargets,
  personDays: number,
  request: MenuRequest,
): number | undefined {
  let lo = 0;
  let hi = 300000;
  let found: number | undefined;
  for (let i = 0; i < 16 && hi - lo > 50; i++) {
    const mid = (lo + hi) / 2;
    const model = buildDishModel(
      candidates,
      targets,
      mid,
      personDays,
      false,
      request.maxCookingMinutes,
      request.days,
    );
    const s = highs.solve(model, { output_flag: false });
    if (s.Status === 'Optimal') {
      found = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return found;
}

function explain(
  schedule: MenuSchedule,
  demands: DishDemand[],
  totalCost: number,
  request: MenuRequest,
  deviation: Record<NutrientKey, number>,
): Explanation[] {
  const out: Explanation[] = [];
  const quality = assessSchedule(schedule);

  const left = request.budget - totalCost;
  const leftShare = request.budget > 0 ? left / request.budget : 0;
  if (leftShare > 0.25) {
    out.push({
      kind: 'info',
      text:
        `Остаётся ${Math.round(left)} ₽ — норма по калориям и белку закрывается ` +
        `дешевле вашего бюджета.`,
    });
  }

  out.push({
    kind: 'info',
    text: `Разных блюд в меню: ${demands.length}. Готовка — около ${Math.round(quality.avgMinutesPerDay)} мин в день.`,
  });

  // самое выгодное блюдо по белку на рубль
  const best = demands
    .filter((d) => d.stats.cost > 0)
    .map((d) => ({ d, ratio: d.stats.nutrients.protein / d.stats.cost }))
    .sort((a, b) => b.ratio - a.ratio)[0];
  if (best) {
    out.push({
      kind: 'value',
      text: `${best.d.stats.recipe.name} — лучший белок за рубль: ${best.ratio.toFixed(1)} г на 1 ₽.`,
    });
  }

  for (const key of NUTRIENT_KEYS) {
    if (Math.abs(deviation[key]) > 12) {
      const label = { kcal: 'калориям', protein: 'белку', fat: 'жирам', carbs: 'углеводам' }[key];
      out.push({
        kind: 'warning',
        text: `Отклонение по ${label}: ${deviation[key] > 0 ? '+' : ''}${deviation[key].toFixed(0)}%.`,
      });
    }
  }

  if (schedule.unplaced.length > 0) {
    out.push({
      kind: 'info',
      text: `${schedule.unplaced.length} блюд не поместились в расписание — останутся про запас.`,
    });
  }

  return out;
}
