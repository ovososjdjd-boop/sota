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
import { plural } from './format';
import { periodTargets, zeroNutrients } from './nutrition';
import {
  computeRecipeStats,
  hasExcluded,
  matchesDietTags,
  MEAL_ENERGY_SHARE,
  type DishRole,
  type MealSlot,
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
  dishPreference,
  emptyPreferences,
  type Preferences,
} from './preferences';
import {
  buildSchedule,
  assessSchedule,
  groupCapacity,
  ROLE_GROUP_MAP,
  MIN_REPEAT_GAP_DAYS,
  type MenuSchedule,
  type DishDemand,
} from './menu';
import { PRODUCT_BY_ID } from '../data/products';
import { grossFromNet, packsNeeded } from './measures';

export interface MenuRequest {
  budget: number;
  days: number;
  eaters: EaterProfile[];
  /** Максимум времени готовки в день, мин */
  maxCookingMinutes?: number;
  /** Что пользователь любит и что не хочет видеть */
  preferences?: Preferences;
  /** Целевой белок, г/кг веса. Задаётся отдельно от калорий */
  proteinPerKg?: number;
}

export interface MenuResult {
  status: 'optimal' | 'budget_too_low' | 'infeasible';
  /**
   * Реальная стоимость закупки с учётом того, что продукты продаются
   * упаковками. На коротком горизонте может заметно превышать totalCost:
   * ради 122 г свинины покупается килограммовая пачка.
   */
  purchaseCost: number;
  /** Стоимость остатков, которые перейдут на следующий период */
  leftoverValue: number;
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
  /** Множитель предпочтения: >1 любимое, <1 нежелательное */
  preference: number;
  /**
   * Штраф за «дробность»: если блюдо требует 122 г свинины, в магазине
   * придётся купить килограммовую пачку. Оптимизатор, считая только
   * граммы, выбирал по чуть-чуть отовсюду — реальный чек выходил
   * на 133% больше расчёта. Штраф отражает эту разницу.
   */
  packagingPenalty: number;
}

/**
 * Переменные упаковок для MILP.
 *
 * Для каждого продукта, встречающегося в блюдах-кандидатах, заводим
 * целую переменную «сколько пачек купить». Это превращает переплату
 * за упаковки из угаданной константы в точно посчитанную величину
 * и заставляет оптимизатор подбирать блюда с общими ингредиентами.
 */
interface PackVar {
  /** Имя переменной в модели (безопасный идентификатор) */
  key: string;
  productId: string;
  /** Доступные фасовки: имя переменной, масса и цена */
  options: { key: string; grams: number; cost: number }[];
  /** Сколько граммов брутто требует одна порция каждого блюда */
  perDish: { i: number; grams: number }[];
}

function buildPackVars(candidates: DishCandidate[]): PackVar[] {
  const byProduct = new Map<string, { i: number; grams: number }[]>();
  for (let i = 0; i < candidates.length; i++) {
    for (const ing of candidates[i].stats.recipe.ingredients) {
      const product = PRODUCT_BY_ID[ing.productId];
      if (!product) continue;
      const list = byProduct.get(ing.productId) ?? [];
      // платим за брутто: кожура и кости тоже стоят денег
      list.push({ i, grams: grossFromNet(product, ing.grams) });
      byProduct.set(ing.productId, list);
    }
  }

  const out: PackVar[] = [];
  let n = 0;
  for (const [productId, perDish] of byProduct) {
    const product = PRODUCT_BY_ID[productId];
    if (!product) continue;
    // Продукты без фасовок (весовые) покупаются сколько нужно —
    // переплаты нет, моделировать нечего.
    if (product.packSizes.length === 0) continue;

    // Переменная на КАЖДУЮ фасовку, а не только на самую крупную.
    //
    // Первая версия брала max(packSizes), и минимальный бюджет месяца
    // подскочил с 4400 до 7800 ₽: под 200 г риса модель «покупала»
    // килограммовый пакет, хотя в магазине есть 400-граммовый.
    // Мы завышали чек и объявляли невыполнимыми бюджеты, которые
    // на самом деле выполнимы. Теперь солвер сам подбирает
    // комбинацию фасовок — ровно как packsNeeded в списке покупок.
    const key = `p${n++}`;
    out.push({
      key,
      productId,
      options: product.packSizes.map((grams, s) => ({
        key: `${key}s${s}`,
        grams,
        cost: (grams / 1000) * product.pricePerKg,
      })),
      perDish,
    });
  }
  return out;
}

/**
 * Насколько блюдо «дробит» закупку: доля переплаты за упаковки,
 * если готовить его заданное число раз.
 */
function packagingPenaltyFor(stats: RecipeStats, typicalPortions: number): number {
  let extra = 0;
  for (const ing of stats.recipe.ingredients) {
    const product = PRODUCT_BY_ID[ing.productId];
    if (!product || product.packSizes.length === 0) continue;
    const need = grossFromNet(product, ing.grams * typicalPortions);
    const packs = packsNeeded(product, need);
    extra += ((packs.totalGrams - need) / 1000) * product.pricePerKg;
  }
  // нормируем на порцию
  return extra / Math.max(1, typicalPortions);
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
  // Сколько РАЗ блюдо появится в меню за период. Правило неповторения
  // допускает days/3, но этого мало: на месяце получалось 10 подач
  // одного блюда, а оладьи попадали в меню 14 раз.
  //
  // Исследование (Nutrola, menu fatigue): приедание начинается на 3-4 неделе
  // и к 6-й становится главной причиной отказа от приложения. Планы
  // с разнообразием удерживают 78% пользователей против 52%.
  //
  // Ограничиваем: не чаще раза в 5 дней для основных блюд.
  // На коротком периоде жёсткий лимит делает план недостижимым:
  // при 7 днях «раз в 5 дней» даёт 1-2 подачи, и еды физически не хватает.
  // Ограничение имеет смысл там, где приедание реально наступает —
  // от двух недель и дальше.
  const gap = days >= 14 ? (recipe.role === 'snack' || recipe.role === 'drink' ? 4 : 5) : MIN_REPEAT_GAP_DAYS;
  const servings = Math.max(2, Math.round(days / gap));
  return Math.max(1, servings * eaters);
}

/**
 * Ослабление нижних границ на итерациях подгонки.
 *
 * Зачем. Когда контур обратной связи урезает потолки неразложимых блюд,
 * жёсткие требования «столько-то основ обеда», «столько-то овощей»
 * перестают выполняться — тем же набором блюд их уже не закрыть, —
 * и задача становится невыполнимой. Солвер возвращает Infeasible,
 * подгонка обрывается, а пользователь остаётся с недобором в четверть
 * рациона (реальный прогон: 1856 ккал при цели 2506).
 *
 * Правильная реакция — не сдаваться, а ослабить именно те требования,
 * которые стали недостижимы. Верхние границы (сахар, жиры, бюджет)
 * НЕ ослабляются никогда: они защищают здоровье и кошелёк.
 */
function buildDishModel(
  candidates: DishCandidate[],
  targets: NutrientTargets,
  budget: number,
  personDays: number,
  integer: boolean,
  maxMinutesPerDay: number | undefined,
  days: number,
  eatersCount: number,
  /** Доля, до которой ослаблены нижние границы: 1 — строго, 0.6 — мягко */
  minSlack = 1,
  /**
   * Моделировать ли упаковки явно (целые переменные «сколько пачек»).
   * Только для MILP: в LP-релаксации дробные пачки смысла не имеют
   * и лишь замедляют решение.
   */
  usePackModel = false,
): string {
  const lines: string[] = [];
  const objTerms: string[] = [];

  // Упаковки моделируются явно только в целочисленной задаче.
  const packVars = usePackModel ? buildPackVars(candidates) : [];

  // ── ОТКЛОНЕНИЯ ОТ НОРМЫ ──
  //
  // Ключевая асимметрия: недобор и перебор — разные по смыслу события.
  //
  // Для калорий и углеводов перебор действительно плох: человек
  // растолстеет. А вот БЕЛОК выше нормы — это не ошибка, а именно то,
  // чего просят: «хочу больше белка при тех же калориях». Раньше
  // штраф был симметричным, и белок намертво вставал на 98 г при любом
  // бюджете — солвер терял столько же за превышение, сколько за недобор.
  // Отсюда жалоба «просил белок — получил фрукты»: приложение считало
  // лишний белок такой же ошибкой, как его нехватку.
  //
  // Теперь превышение белка почти бесплатно (штраф 0.05 против 12),
  // а физиологический потолок 2.2 г/кг по-прежнему держит рельса hi_.
  for (const key of NUTRIENT_KEYS) {
    // Недобор калорий — САМАЯ дорогая ошибка, дороже любой экономии.
    //
    // Вес был 1 против 12 у макронутриентов, и это работало, пока
    // в цели не появился штраф за остатки упаковок. После него солвер
    // предпочитал недокормить человека на 22%, лишь бы не покупать
    // лишнюю пачку: голод «стоил» дешевле выброшенной еды.
    // Приложение существует, чтобы кормить, — ставим 60.
    const w = key === 'kcal' ? 60 : 12;
    const scale = Math.max(1, targets[key].target) / 1000;
    // Перебор калорий тоже плох (человек растолстеет), но не настолько:
    // лишние 5% съедаются, недостающие 20% — это голод.
    const overWeight = key === 'protein' ? 0.05 : key === 'kcal' ? 8 : w;
    objTerms.push(
      `${(overWeight / scale).toFixed(6)} over_${key}`,
      `${(w / scale).toFixed(6)} under_${key}`,
    );
  }

  // ── БЮДЖЕТ КАК РЕСУРС, А НЕ КАК ЭКОНОМИЯ ──
  //
  // Отзыв пользователя: «не потрачено 4630 ₽ из 15000. Почему?
  // Я готов их потратить на мясо». Прогон подтверждал худшее: при
  // бюджете 40 000 ₽ приложение тратило 13 265 ₽ (33%), доля мяса
  // оставалась 5.9%, а белок не рос вообще — 1.16 г/кг при любых деньгах.
  //
  // Причина: в целевой функции стоял штраф за каждый потраченный рубль
  // («мягкая бережливость»), а награда за качество была слишком слабой,
  // чтобы его перебить. Приложение вело себя как бухгалтер, экономящий
  // чужие деньги, хотя человек уже решил, сколько готов отдать.
  //
  // Бюджет — это РЕСУРС на качество рациона, а не то, что надо
  // сберечь. Экономия имеет смысл только там, где денег не хватает:
  // если бюджет заведомо тесный, бережливость снова включается,
  // иначе задача станет невыполнимой.
  //
  // Порог: минимальная разумная стоимость рациона. Ниже него экономим,
  // выше — тратим на качество. Оценка снизу — самые дешёвые калории
  // в базе, умноженные на потребность.
  const cheapestPerKcal = Math.min(
    ...candidates
      .filter((c) => c.stats.nutrients.kcal > 0)
      .map((c) => c.stats.cost / c.stats.nutrients.kcal),
  );
  const survivalCost = cheapestPerKcal * targets.kcal.target;
  const isTight = budget > 0 && budget < survivalCost * 2.2;

  if (budget > 0) {
    // Штраф за трату денег. На тесном бюджете он сильный — иначе
    // не уложиться; на свободном остаётся слабым тай-брейком,
    // чтобы не покупать лишние пачки «просто так».
    const perRuble = (isTight ? 0.6 : 0.12) / budget;
    if (packVars.length > 0) {
      // ШТРАФУЕМ ОСТАТКИ, А НЕ ТРАТЫ.
      //
      // Штраф за каждый потраченный рубль — тупиковый путь: он мешает
      // покупать хорошее ровно так же, как лишнее, и мы уже получали
      // из-за него рацион, не менявшийся при росте бюджета втрое.
      //
      // Человека же расстраивает не потраченная сумма (он сам её назвал),
      // а еда, которая осталась лежать и пропала. Поэтому цена в целевой
      // функции — стоимость ОСТАТКА: сколько денег заморожено в хвостах
      // упаковок. Дорогая, но съеденная целиком свинина штрафа не несёт,
      // а забытые 400 г мяса — несут.
      //
      // Это и есть механизм пересечения ингредиентов: чтобы не платить
      // за остаток, солвер подбирает блюда, доедающие начатую пачку.
      // МАСШТАБ. Первая версия штрафа делила на бюджет и давала
      // коэффициент 0.000026 при награде за разнообразие 2.5 —
      // разница в сто тысяч раз, штраф просто терялся в шуме.
      // Приводим к тому же масштабу, что остальные слагаемые цели:
      // «сколько единиц цели стоит рубль выброшенной еды».
      // Вес 3.5 подобран экспериментом (scripts/tune.ts, месяц/15000 ₽):
      //    0 → переплата 61%, 82 продукта
      //  3.5 → переплата 15%, 55 продуктов, белок даже вырос до 1.28 г/кг
      //   20 → переплата 12%, но калорийность падает до 1960 — солвер
      //        начинает экономить на еде ради «красивой» закупки
      // Берём точку, где переплата уже мала, а питание ещё не страдает.
      const WASTE_WEIGHT = 3.5;
      const perRubleWasted = (WASTE_WEIGHT * 40) / Math.max(1, targets.kcal.target / 1000);
      packVars.forEach((pv) => {
        const product = PRODUCT_BY_ID[pv.productId];
        if (!product) return;
        const rubPerGram = product.pricePerKg / 1000;
        objTerms.push(`${(perRubleWasted * rubPerGram).toFixed(9)} w_${pv.key}`);
        // слабый штраф за сам факт траты — тай-брейк, чтобы не брать
        // лишнюю пачку «про запас», когда качество от неё не растёт
        for (const o of pv.options) {
          objTerms.push(`${(perRuble * o.cost).toFixed(9)} n${o.key}`);
        }
      });
    } else if (isTight) {
      candidates.forEach((c, i) => {
        objTerms.push(`${(perRuble * c.stats.cost).toFixed(9)} x${i}`);
      });
    }
  }

  // Предпочтения пользователя. Любимое блюдо получает отрицательный
  // вклад в целевую функцию (мы минимизируем), нежеланное — штраф.
  // Масштаб подобран так, чтобы предпочтения ощутимо влияли на выбор,
  // но не ломали КБЖУ и бюджет.
  candidates.forEach((c, i) => {
    const delta = c.preference - 1;
    if (Math.abs(delta) > 0.01) {
      const bonus = delta * 6;
      objTerms.push(`${bonus > 0 ? '-' : ''}${Math.abs(bonus).toFixed(6)} x${i}`);
    }
  });

  // Награда за качественный белок — главное, на что тратится бюджет.
  //
  // Вес поднят с 45 до 140 на свободном бюджете: прежнего не хватало,
  // чтобы перебить штраф за трату денег, и рацион не менялся вообще
  // при росте бюджета втрое. Мясо, рыба, творог дороже круп —
  // без сильной награды солвер их просто не берёт.
  const qWeight = isTight ? 45 : 140;
  const qScale = qWeight / Math.max(1, targets.protein.target);
  candidates.forEach((c, i) => {
    let qp = 0;
    for (const cat of PROTEIN_CATEGORIES) {
      qp += c.stats.categoryKcal[cat] ? proteinFromCategory(c.stats, cat) : 0;
    }
    if (qp > 0) objTerms.push(`-${(qScale * qp).toFixed(9)} x${i}`);
  });

  // Награда за РАЗНООБРАЗИЕ рациона при свободных деньгах.
  //
  // Без неё солвер, получив задачу «набери побольше белка», сваливается
  // в одно самое белково-выгодное блюдо и готовит его весь месяц.
  // Разнообразие — прямой фактор удержания (78% против 52%,
  // см. docs/COMPETITORS.md), поэтому оплачиваем его явно: каждое
  // РАЗНОЕ блюдо в меню чуть улучшает цель. Считается по индикатору
  // использования u_i (см. ниже, ограничение use_*), а не по порциям —
  // иначе «разнообразие» набирается одним блюдом в 30 порциях.
  const varietyBonus = isTight ? 0 : 2.5;
  const useVars = integer && varietyBonus > 0;
  if (useVars) {
    candidates.forEach((_, i) => {
      objTerms.push(`-${varietyBonus.toFixed(6)} u${i}`);
    });
  }

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
    lines.push(` lo_${key}: ${terms} >= ${(targets[key].min * 0.75 * minSlack).toFixed(3)}`);
    lines.push(` hi_${key}: ${terms} <= ${(targets[key].max * 1.25).toFixed(3)}`);
  }

  // ── БЮДЖЕТ СЧИТАЕТСЯ ПО УПАКОВКАМ, А НЕ ПО ГРАММАМ ──
  //
  // Раньше переплата за упаковки закладывалась в цену блюда константой
  // (packagingPenalty). Это принципиально не могло работать: штраф
  // не зависел от того, какие ЕЩЁ блюда попали в меню. Оптимизатор
  // не понимал, что рис в плове и рис в запеканке — одна пачка риса,
  // и «размазывал» закупку: 78 разных продуктов, переплата 64%.
  //
  // Теперь упаковки моделируются явно. Для каждого продукта:
  //   g_p — сколько граммов брутто нужно всем блюдам меню
  //   n_p — сколько упаковок купить (целое), n_p ≥ g_p / размер пачки
  // Чек = Σ n_p × размер × цена. Именно он ограничен бюджетом.
  //
  // Ключевое следствие — ПЕРЕСЕЧЕНИЕ ИНГРЕДИЕНТОВ появляется само,
  // без эвристик и коэффициентов Жаккара. Два блюда на общем продукте
  // делят одну пачку, и целевая функция это видит напрямую: разница
  // между «купить одну пачку» и «купить две» посчитана точно, а не
  // угадана. Это и есть отличие, которого нет у конкурентов
  // (docs/COMPETITORS.md, п.7): у них список покупок строится ПОСЛЕ
  // выбора блюд, поэтому влиять на выбор он не может.
  if (packVars.length > 0) {
    // связь: граммы брутто, нужные меню, не больше купленного
    for (const pv of packVars) {
      const need = pv.perDish
        .map(({ i, grams }) => `${grams.toFixed(6)} x${i}`)
        .join(' + ');
      const bought = pv.options
        .map((o) => `${o.grams.toFixed(3)} n${o.key}`)
        .join(' + ');
      // Купленное покрывает нужное, а разница — ОСТАТОК, который
      // осядет дома. Выделяем его явной переменной: именно остаток
      // штрафуется в целевой функции (см. ниже).
      lines.push(` pack_${pv.key}: ${bought} - ${need} - w_${pv.key} = 0`);
    }
    lines.push(
      ` budget: ` +
        packVars
          .flatMap((pv) => pv.options.map((o) => `${o.cost.toFixed(6)} n${o.key}`))
          .join(' + ') +
        ` <= ${budget.toFixed(2)}`,
    );
  } else {
    // LP-релаксация и запасной путь: оценка по граммам с поправкой
    lines.push(
      ` budget: ` +
        candidates
          .map((c, i) => `${(c.stats.cost + c.packagingPenalty * 0.6).toFixed(6)} x${i}`)
          .join(' + ') +
        ` <= ${(budget * 0.97).toFixed(2)}`,
    );
  }

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
    // Минимальные доли категорий переносятся на блюда ВЫБОРОЧНО.
    //
    // Для «хлеба» требование бессмысленно: блюд из одного хлеба почти нет,
    // он входит в состав как добавка — ограничение делало задачу
    // невыполнимой (нужно 1052 ккал, максимум достижимо 1041).
    //
    // Но для мяса и рыбы оно необходимо: без него оптимизатор экономил
    // и давал 1.1% энергии из мяса — неделя фактически без мясных блюд.
    const NEEDS_MINIMUM: string[] = ['meat', 'fish', 'dairy'];
    if (rule.minEnergyShare > 0 && NEEDS_MINIMUM.includes(category)) {
      lines.push(
        ` catmin_${category}: ${terms} >= ${(totalKcal * rule.minEnergyShare * minSlack).toFixed(2)}`,
      );
    }
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
      ` quality_protein: ${qualityTerms} >= ${(targets.protein.target * MIN_QUALITY_PROTEIN_SHARE * minSlack).toFixed(2)}`,
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
      ` fiber_min: ${fiberTerms} >= ${(FIBER_TARGET_PER_PERSON_DAY * personDays * FIBER_MIN_SHARE * minSlack).toFixed(2)}`,
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
      ` produce_min: ${produceTerms} >= ${(PRODUCE_MIN_GRAMS_PER_PERSON_DAY * personDays * minSlack).toFixed(1)}`,
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

  // Гарниры — дополнение, а не самостоятельная еда. Без потолка солвер
  // заказывал 44 лишние порции отварного картофеля, недобирая завтраки.
  const sideTerms = candidates
    .map((c, i) => (c.stats.recipe.role === 'side' ? `x${i}` : null))
    .filter(Boolean)
    .join(' + ');
  if (sideTerms) {
    lines.push(` side_max: ${sideTerms} <= ${Math.ceil(personDays * 1.1)}`);
  }

  // ── ВМЕСТИМОСТЬ РАСПИСАНИЯ (условие Холла) ──
  //
  // Главный найденный дефект: фаза 1 заказывала еду, не зная, сколько
  // подач физически влезает в расписание. 17-29% порций не размещались,
  // но продукты на них ПОКУПАЛИСЬ и попадали в КБЖУ. Пользователь платил
  // за еду, которой нет в его меню, и видел завышенную калорийность.
  //
  // Задача раскладки — двудольное паросочетание: блюда с одной стороны,
  // места в приёмах с другой. Теорема Холла даёт точный критерий
  // разрешимости: для ЛЮБОГО набора приёмов S суммарный заказ блюд,
  // которые больше никуда не годятся, не должен превышать вместимость S.
  //
  // Проверять только «все слоты сразу» недостаточно — именно поэтому
  // первая версия ограничения сняла лишь треть проблемы. Каши годятся
  // только в завтрак, гарниры — только в обед и ужин; вместе они
  // укладывались в общий лимит группы «основа», а по отдельности нет.
  // Слотов четыре, подмножеств 15 — перебор бесплатный.
  //
  // Ограничение двойное, потому что место кончается двумя способами:
  //   мест  — в один приём не ставят два блюда одной группы;
  //   калорий — перекус это 15% рациона, сколько туда ни закажи.
  const ALL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

  // группы блюд, по которым действует правило «одно на приём»
  const groups = new Set(
    candidates.map((c) => ROLE_GROUP_MAP[c.stats.recipe.role] ?? c.stats.recipe.role),
  );

  let hallIndex = 0;
  for (let mask = 1; mask < 1 << ALL_SLOTS.length; mask++) {
    const subset = ALL_SLOTS.filter((_, bit) => mask & (1 << bit));
    // полное множество ограничивать незачем: это уже сделано балансом
    // калорий, а лишнее ограничение только замедляет солвер
    if (subset.length === ALL_SLOTS.length) continue;

    // блюда, которым некуда деться за пределами subset
    const confined = candidates
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.stats.recipe.slots.every((s) => subset.includes(s)));
    if (confined.length === 0) continue;

    // (а) вместимость по калориям
    const energyCap = subset.reduce(
      (sum, s) => sum + totalKcal * MEAL_ENERGY_SHARE[s],
      0,
    );
    const energyTerms = confined
      .map(({ c, i }) => `${c.stats.nutrients.kcal.toFixed(6)} x${i}`)
      .join(' + ');
    // 1.15 — приём можно немного перебрать, раскладка это допускает
    lines.push(
      ` hallE_${hallIndex}: ${energyTerms} <= ${(energyCap * 1.15).toFixed(2)}`,
    );

    // (б) вместимость по местам, отдельно для каждой ролевой группы
    for (const group of groups) {
      const inGroup = confined.filter(
        ({ c }) => (ROLE_GROUP_MAP[c.stats.recipe.role] ?? c.stats.recipe.role) === group,
      );
      if (inGroup.length === 0) continue;
      const seats = groupCapacity(subset, days, eatersCount);
      // 0.9: часть мест съедают правило неповторения и лимит блюд
      // в приёме — теоретический максимум недостижим на практике
      lines.push(
        ` hallS_${hallIndex}_${group}: ${inGroup.map(({ i }) => `x${i}`).join(' + ')}` +
          ` <= ${Math.max(1, Math.floor(seats * 0.9))}`,
      );
    }
    hallIndex++;
  }

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
      // Запас 1.35: часть блюд-основ уходит в другие приёмы, где они
      // тоже уместны (макароны по-флотски годятся и на ужин).
      // Вместе с потолком days/3 на блюдо это заставляет солвер
      // набрать достаточно РАЗНЫХ основ, а не повторять одну.
      const need = Math.ceil(personDays * 1.35);
      lines.push(` core_${slot}: ${terms} >= ${Math.max(1, Math.floor(need * minSlack))}`);
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
    lines.push(` core_lunch_dinner: ${lunchDinnerTerms} >= ${Math.max(1, Math.floor(personDays * 2 * minSlack))}`);
  }

  // Дополнения к завтраку. Каша сама по себе даёт ~390 ккал при норме 751 —
  // завтрак недобирал почти половину. Нужны бутерброды, яйца, молочное.
  const breakfastExtras = candidates
    .map((c, i) => {
      const r = c.stats.recipe;
      const suits = r.slots.includes('breakfast');
      const isExtra = r.role === 'bakery' || r.role === 'drink' || r.role === 'snack' || r.role === 'main';
      return suits && isExtra ? `x${i}` : null;
    })
    .filter(Boolean)
    .join(' + ');
  if (breakfastExtras) {
    lines.push(` breakfast_extras: ${breakfastExtras} >= ${Math.max(1, Math.floor(personDays * 0.8 * minSlack))}`);
  }

  // Супы отдельно: обед без супа возможен, но не всю неделю подряд.
  const soupTerms = candidates
    .map((c, i) => (c.stats.recipe.role === 'soup' ? `x${i}` : null))
    .filter(Boolean)
    .join(' + ');
  if (soupTerms) {
    lines.push(` soup_min: ${soupTerms} >= ${Math.max(1, Math.floor(personDays * 0.4 * minSlack))}`);
  }

  // Разнообразие основ обеда. Правило неповторения (раз в 3 дня) означает,
  // что одно блюдо покрывает максимум days/3 обедов. Чтобы каждый обед
  // получил суп или основное, разных таких блюд нужно минимум days/3.
  // Иначе получаем «обед из отварного картофеля» — реальный дефект.
  const maxServingsPerDish = Math.max(1, Math.floor(days / MIN_REPEAT_GAP_DAYS));
  candidates.forEach((c, i) => {
    const r = c.stats.recipe;
    if (r.slots.includes('lunch') && (r.role === 'soup' || r.role === 'main')) {
      lines.push(` lunchcap_${i}: x${i} <= ${maxServingsPerDish * eatersCount}`);
    }
  });

  // Время готовки.
  //
  // Была ошибка: время делилось на batchPortions целиком, будто одна
  // готовка обслуживает все порции блюда за период. На деле блюдо
  // готовится заново каждые keepsDays дней. Из-за заниженной оценки
  // лимит «60 минут в день» давал реальные 126 минут.
  if (maxMinutesPerDay && maxMinutesPerDay > 0) {
    const timeTerms = candidates
      .map((c, i) => {
        const r = c.stats.recipe;
        // Сколько порций реально покрывает одна готовка.
        //
        // Формула min(batchPortions, едоки × (keepsDays + 1)) описывает
        // ИДЕАЛ: все порции блюда идут подряд, пока не кончится кастрюля.
        // Раскладка так не делает и не должна — она разносит подачи ради
        // разнообразия. Замер (scripts/batcheff.ts) показал занижение
        // времени на 28% при лимите 60 мин и на 47% при 90 мин:
        // фаза 1 ждала 3-4 порции с готовки, выходило 1.3-2.0.
        //
        // Из-за занижения солвер заказывал больше, чем можно приготовить,
        // бюджет времени исчерпывался на 102%, и обед недобирал 25%
        // калорий. Берём КОНСЕРВАТИВНУЮ оценку: не больше двух подач
        // с одной готовки — это то, что раскладка стабильно достигает.
        const ideal = Math.min(r.batchPortions, eatersCount * (r.keepsDays + 1));
        const realistic = r.keepsDays > 0 ? Math.min(ideal, eatersCount * 2) : eatersCount;
        const perCook = Math.max(1, realistic);
        return `${(r.minutes / perCook).toFixed(4)} x${i}`;
      })
      .join(' + ');
    lines.push(` cook_time: ${timeTerms} <= ${(maxMinutesPerDay * days).toFixed(1)}`);

    // При жёстком лимите одного бюджета времени мало: раскладка не сможет
    // разместить трудоёмкие блюда, и приёмы останутся пустыми (покрытие
    // падало до 57%). Требуем достаточную долю блюд, укладывающихся
    // в лимит по отдельности.
    if (maxMinutesPerDay <= 75) {
      const quickTerms = candidates
        .map((c, i) =>
          c.stats.recipe.minutes <= maxMinutesPerDay * 0.6 ? `x${i}` : null,
        )
        .filter(Boolean)
        .join(' + ');
      if (quickTerms) {
        lines.push(` quick_min: ${quickTerms} >= ${Math.max(1, Math.floor(personDays * 2.2 * minSlack))}`);
      }
    }
  }

  // Блюда «каждый день»: кофе по утрам — привычка, а не случайный перекус.
  // Требуем ровно по одной подаче на каждый день периода.
  candidates.forEach((c, i) => {
    if (c.preference >= 3) {
      lines.push(` always_${i}: x${i} >= ${Math.max(1, Math.floor(personDays * minSlack))}`);
    }
  });

  // Разнообразие: ни одно блюдо не даёт больше 12% энергии рациона.
  // Без этого солвер набирал 60 порций самого дешёвого блюда и обходился
  // 22 позициями из 51 — разложить такое в расписание невозможно,
  // и у больших семей оставались пустые приёмы.
  // Доля одного блюда в энергии рациона. Было 12% — при 30 днях это
  // позволяло одному блюду закрывать почти четверть месяца.
  // Чем длиннее период, тем меньше должна быть доля.
  const maxDishShare = days >= 21 ? 0.05 : days >= 12 ? 0.08 : 0.12;
  candidates.forEach((c, i) => {
    // блюда «каждый день» под лимит разнообразия не попадают
    if (c.preference >= 3) return;
    const k = c.stats.nutrients.kcal;
    if (k > 0) {
      lines.push(
        ` var_${i}: ${k.toFixed(6)} x${i} <= ${(totalKcal * maxDishShare).toFixed(2)}`,
      );
    }
  });

  // ── ИНДИКАТОРЫ ИСПОЛЬЗОВАНИЯ БЛЮДА (для разнообразия) ──
  //
  // u_i = 1, если блюдо вообще попало в меню. Награда за разнообразие
  // начисляется за КОЛИЧЕСТВО РАЗНЫХ блюд, а не за количество порций,
  // иначе солвер «разнообразит» одним блюдом в 30 порциях.
  //
  // Связь u_i с x_i: u_i не может быть больше числа порций (u ≤ x),
  // значит блюдо, которого нет в меню, награды не приносит.
  // Обратная связь (x ≤ M·u) не нужна: мы награждаем u, и солверу
  // выгодно поднять его до предела, а предел задан именно через x.
  if (useVars) {
    candidates.forEach((_, i) => {
      lines.push(` use_${i}: u${i} - x${i} <= 0`);
    });
  }

  lines.push('Bounds');
  candidates.forEach((c, i) => lines.push(` 0 <= x${i} <= ${c.maxPortions}`));
  if (useVars) {
    candidates.forEach((_, i) => lines.push(` 0 <= u${i} <= 1`));
  }
  for (const pv of packVars) {
    for (const o of pv.options) lines.push(` n${o.key} >= 0`);
    lines.push(` w_${pv.key} >= 0`);
  }
  for (const key of NUTRIENT_KEYS) {
    lines.push(` over_${key} >= 0`, ` under_${key} >= 0`);
  }

  if (integer) {
    const ints = candidates.map((_, i) => `x${i}`);
    if (useVars) ints.push(...candidates.map((_, i) => `u${i}`));
    // число упаковок — обязательно целое: полпачки не купить
    ints.push(...packVars.flatMap((pv) => pv.options.map((o) => `n${o.key}`)));
    lines.push('General', ' ' + ints.join(' '));
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
  const prefs = request.preferences ?? emptyPreferences();

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
    const preference = dishPreference(recipe, prefs, products);
    // «не предлагать» — блюдо вообще не рассматривается
    if (preference === 0) continue;

    const maxPortions =
      preference >= 3
        ? request.days * request.eaters.length
        : maxPortionsFor(recipe, request.days, request.eaters.length);
    // типичное число готовок за период — по правилу неповторения
    const typical = Math.max(
      1,
      Math.min(maxPortions, Math.ceil(request.days / 3) * request.eaters.length),
    );
    candidates.push({
      stats,
      maxPortions,
      preference,
      packagingPenalty: packagingPenaltyFor(stats, typical),
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
    purchaseCost: 0,
    leftoverValue: 0,
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
      request.eaters.length,
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

  // Сужение границ по LP + шорт-лист. База выросла до 112 блюд,
  // и MILP на всех кандидатах занимал 3.7 с. LP-релаксация подсказывает,
  // какие блюда перспективны, а какие можно отбросить.
  const scored = candidates
    .map((c, i) => ({ c, v: lp.Columns?.[`x${i}`]?.Primal ?? 0, i }))
    .sort((a, b) => b.v - a.v);

  const SHORTLIST = 70;
  const keep = new Set(scored.slice(0, SHORTLIST).map((x) => x.i));
  // добираем разнообразие: минимум по 6 блюд каждой роли
  const byRole = new Map<string, number>();
  for (const { c, i } of scored) {
    const role = c.stats.recipe.role;
    const n = byRole.get(role) ?? 0;
    if (n < 6) {
      keep.add(i);
      byRole.set(role, n + 1);
    }
  }

  const bounded = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => keep.has(i))
    .map(({ c, i }) => ({
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
    request.eaters.length,
    1,
    true, // упаковки моделируем явно — это даёт пересечение ингредиентов
  );
  const sol = highs.solve(milpModel, {
    output_flag: false,
    mip_abs_gap: 5,
    // 'Time limit reached' — не провал: решение принимается, если оно есть.
    time_limit: 2,
  });

  // ── сборка результата фазы 1 ──
  const demands: DishDemand[] = [];

  bounded.forEach((c, i) => {
    const portions = Math.round(sol.Columns?.[`x${i}`]?.Primal ?? 0);
    if (portions <= 0) return;
    demands.push({ stats: c.stats, portions, daily: c.preference >= 3 });
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

  // ── фаза 2: расписание по дням, с обратной связью на фазу 1 ──
  //
  // Ограничения вместимости отсекают заведомо неразложимые заказы,
  // но точно предсказать раскладку линейной моделью нельзя: правило
  // неповторения и лимит времени зависят от порядка размещения.
  //
  // Поэтому замыкаем контур. Раскладываем, смотрим, что не влезло,
  // и пересобираем заказ с урезанными потолками для этих блюд —
  // освободившиеся деньги и калории уходят на блюда, которым место есть.
  // Двух-трёх итераций достаточно: остаток падает с 25% до ~2%.
  //
  // Это дешевле, чем моделировать раскладку внутри MILP: одна итерация
  // раскладки — миллисекунды против секунд на переформулированный солвер.
  const dailyKcal = targets.kcal.target / request.days;

  let schedule = buildSchedule(
    demands,
    request.days,
    request.eaters.length,
    dailyKcal,
    request.maxCookingMinutes,
  );

  /**
   * Фактический чек по расписанию — то, что реально пробьётся в кассе.
   * Считается ровно так же, как список покупок, поэтому расхождение
   * между обещанием и магазином невозможно.
   */
  const actualPurchaseCost = (sched: MenuSchedule): number => {
    const need: Record<string, number> = {};
    for (const day of sched.days)
      for (const meal of day.meals)
        for (const dish of meal.dishes)
          for (const ing of dish.recipe.ingredients)
            need[ing.productId] = (need[ing.productId] ?? 0) + ing.grams * dish.portions;
    let sum = 0;
    for (const [pid, grams] of Object.entries(need)) {
      const product = products[pid];
      if (!product) continue;
      const packs = packsNeeded(product, grossFromNet(product, grams));
      sum += (packs.totalGrams / 1000) * product.pricePerKg;
    }
    return sum;
  };

  // ── БЮДЖЕТ ВРЕМЕНИ НА РАСЧЁТ ──
  //
  // Приоритет — телефон: человек не станет ждать, глядя на спиннер.
  // Модель упаковок добавила сотни целых переменных, и месячный план
  // с лимитом готовки считался 8 секунд: каждая итерация подгонки
  // решала MILP заново с лимитом 4 с.
  //
  // Теперь бюджет общий на весь расчёт. Подгонка улучшает результат,
  // но не бесконечно: если время вышло, отдаём лучшее из найденного.
  // Меню, посчитанное за 2 секунды и покрывающее 92% нормы, полезнее
  // идеального через 8 секунд — второе просто не дождутся.
  const TOTAL_BUDGET_MS = 2500;
  const MAX_REFIT = 3;
  for (let iter = 0; iter < MAX_REFIT; iter++) {
    if (Date.now() - t0 > TOTAL_BUDGET_MS) break;
    const unplacedTotal = schedule.unplaced.reduce((s, x) => s + x.portions, 0);
    const orderedTotal = demands.reduce((s, d) => s + d.portions, 0);
    // 2% — шум раскладки, гоняться за ним не стоит
    if (orderedTotal === 0 || unplacedTotal / orderedTotal <= 0.02) break;

    // сколько порций каждого блюда реально легло в расписание
    const placed = new Map<string, number>();
    for (const day of schedule.days) {
      for (const meal of day.meals) {
        for (const dish of meal.dishes) {
          placed.set(dish.recipe.id, (placed.get(dish.recipe.id) ?? 0) + dish.portions);
        }
      }
    }

    // Урезаем потолок ровно до размещённого: больше этого блюда
    // в расписание не входит, сколько его ни заказывай.
    const refit = bounded.map((c) => {
      const got = placed.get(c.stats.recipe.id);
      if (got === undefined) return c;
      const wanted =
        demands.find((d) => d.stats.recipe.id === c.stats.recipe.id)?.portions ?? 0;
      if (got >= wanted) return c;
      return { ...c, maxPortions: Math.max(1, got) };
    });

    // Урезание потолков делает часть нижних границ недостижимой:
    // «столько-то основ обеда» уже не набрать оставшимися блюдами.
    // Раньше солвер отвечал Infeasible, подгонка обрывалась на первой
    // же итерации, и человек оставался с недобором в четверть рациона.
    // Пробуем последовательно ослаблять — до первого выполнимого.
    // Верхние границы (сахар, жиры, бюджет) при этом не трогаются.
    let refitSol: { Status?: string; Columns?: Record<string, { Primal?: number }> } | null =
      null;
    for (const slack of [1, 0.85, 0.7, 0.55]) {
      const model = buildDishModel(
        refit,
        targets,
        request.budget,
        personDays,
        true,
        request.maxCookingMinutes,
        request.days,
        request.eaters.length,
        slack,
        true,
      );
      const leftMs = TOTAL_BUDGET_MS - (Date.now() - t0);
      if (leftMs < 200) break;
      const s = highs.solve(model, {
        output_flag: false,
        mip_abs_gap: 5,
        time_limit: Math.max(0.3, leftMs / 1000),
      });
      if (s.Columns && Object.keys(s.Columns).length > 0 && s.Status !== 'Infeasible') {
        refitSol = s;
        break;
      }
    }
    if (!refitSol) break;

    const nextDemands: DishDemand[] = [];
    refit.forEach((c, i) => {
      const portions = Math.round(refitSol.Columns?.[`x${i}`]?.Primal ?? 0);
      if (portions > 0) {
        nextDemands.push({ stats: c.stats, portions, daily: c.preference >= 3 });
      }
    });
    if (nextDemands.length === 0) break;

    const nextSchedule = buildSchedule(
      nextDemands,
      request.days,
      request.eaters.length,
      dailyKcal,
      request.maxCookingMinutes,
    );

    // принимаем итерацию, только если расписание стало полнее по еде
    const kcalOf = (s: typeof schedule) =>
      s.days.reduce((sum, d) => sum + d.nutrients.kcal, 0);
    if (kcalOf(nextSchedule) <= kcalOf(schedule)) break;

    // ...и только если чек по-прежнему укладывается в бюджет.
    // Модель считает упаковки приближённо (солвер вправе выбрать
    // комбинацию фасовок, которой не даст packsNeeded), поэтому
    // сверяемся с фактом. Бюджет — главное обещание приложения:
    // лучше оставить недоразложенные порции, чем превысить сумму.
    if (request.budget > 0 && actualPurchaseCost(nextSchedule) > request.budget) break;

    schedule = nextSchedule;
    demands.length = 0;
    demands.push(...nextDemands);
  }

  // ── ПОСЛЕДНЯЯ ЛИНИЯ ОБОРОНЫ БЮДЖЕТА ──
  //
  // Бюджет — главное обещание приложения, и оно не должно зависеть
  // от точности внутренней модели. Модель считает упаковки приближённо
  // (солвер комбинирует фасовки не так, как packsNeeded), и на бюджете
  // 9000 ₽ чек выходил 10019 ₽ — превышение на 11%.
  //
  // Здесь мы сверяемся с ФАКТОМ и, если вышли за сумму, убираем блюда
  // с конца — начиная с самых дорогих подач, которые меньше всего
  // портят рацион (сначала перекусы и напитки, потом основы).
  // Лучше подать на одно яблоко меньше, чем нарушить обещание.
  if (request.budget > 0 && actualPurchaseCost(schedule) > request.budget) {
    const dropOrder = ['snack', 'drink', 'salad', 'side', 'bakery', 'porridge', 'main', 'soup'];
    let guard = 0;
    while (actualPurchaseCost(schedule) > request.budget && guard++ < 200) {
      // ищем самую дорогую подачу наименее важной роли
      let victim: { dayIdx: number; mealIdx: number; dishIdx: number; rank: number; cost: number } | null =
        null;
      schedule.days.forEach((day, dayIdx) =>
        day.meals.forEach((meal, mealIdx) =>
          meal.dishes.forEach((dish, dishIdx) => {
            const rank = dropOrder.indexOf(dish.recipe.role);
            const cost = dish.stats.cost * dish.portions;
            if (
              !victim ||
              rank < victim.rank ||
              (rank === victim.rank && cost > victim.cost)
            ) {
              victim = { dayIdx, mealIdx, dishIdx, rank: rank < 0 ? 99 : rank, cost };
            }
          }),
        ),
      );
      if (!victim) break;
      const v = victim as { dayIdx: number; mealIdx: number; dishIdx: number };
      const day = schedule.days[v.dayIdx];
      const meal = day.meals[v.mealIdx];
      const [removed] = meal.dishes.splice(v.dishIdx, 1);
      if (!removed) break;
      const k = removed.portions;
      const n = removed.stats.nutrients;
      for (const target of [meal.nutrients, day.nutrients]) {
        target.kcal -= n.kcal * k;
        target.protein -= n.protein * k;
        target.fat -= n.fat * k;
        target.carbs -= n.carbs * k;
        target.fiber = (target.fiber ?? 0) - (n.fiber ?? 0) * k;
      }
      if (removed.cooked) {
        meal.minutes = Math.max(0, meal.minutes - removed.recipe.minutes);
        day.minutes = Math.max(0, day.minutes - removed.recipe.minutes);
      }
      schedule.unplaced.push({ recipe: removed.recipe, portions: k });
    }
  }

  // ── ИСТОЧНИК ПРАВДЫ — РАСПИСАНИЕ, А НЕ ЗАКАЗ ──
  //
  // Найденный дефект, самый дорогой из всех. Раньше корзина, КБЖУ
  // и чек считались по заказу фазы 1. Но часть порций фаза 2 разложить
  // не могла — и человек ПОКУПАЛ еду, которой нет в его меню:
  // 17-29% порций на месячном плане. Одновременно приложение показывало
  // 2500 ккал в день, хотя на тарелках лежало 1780: цифра бралась
  // из заказа, а не из того, что человек реально съест.
  //
  // Теперь считаем строго по расписанию. Что не разложилось — то
  // не куплено и не посчитано. Это делает невозможным целый класс
  // расхождений: список покупок, меню и КБЖУ выводятся из одного
  // объекта, рассинхронизация исключена конструктивно.
  const actual = zeroNutrients();
  const productNeeds: Record<string, number> = {};
  let totalCost = 0;

  for (const day of schedule.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        const n = dish.stats.nutrients;
        const k = dish.portions;
        actual.kcal += n.kcal * k;
        actual.protein += n.protein * k;
        actual.fat += n.fat * k;
        actual.carbs += n.carbs * k;
        actual.fiber = (actual.fiber ?? 0) + (n.fiber ?? 0) * k;
        totalCost += dish.stats.cost * k;
        for (const ing of dish.recipe.ingredients) {
          productNeeds[ing.productId] = (productNeeds[ing.productId] ?? 0) + ing.grams * k;
        }
      }
    }
  }

  // Реальная стоимость закупки: продукты покупаются упаковками.
  let purchaseCost = 0;
  let leftoverValue = 0;
  for (const [productId, netGrams] of Object.entries(productNeeds)) {
    const product = products[productId];
    if (!product) continue;
    const gross = grossFromNet(product, netGrams);
    const packs = packsNeeded(product, gross);
    purchaseCost += (packs.totalGrams / 1000) * product.pricePerKg;
    leftoverValue += (packs.leftover / 1000) * product.pricePerKg;
  }

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
    purchaseCost,
    leftoverValue,
    actual,
    target: targetNutrients,
    deviation,
    solveTimeMs: Date.now() - t0,
    explanations: explain(
      schedule,
      demands,
      totalCost,
      request,
      deviation,
      purchaseCost,
      leftoverValue,
    ),
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
      request.eaters.length,
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
  purchaseCost = 0,
  leftoverValue = 0,
): Explanation[] {
  const out: Explanation[] = [];
  const quality = assessSchedule(schedule);

  // ОСТАТОК СЧИТАЕТСЯ ОТ РЕАЛЬНОГО ЧЕКА, А НЕ ОТ СТОИМОСТИ ЕДЫ.
  //
  // Была ошибка: остаток считался от totalCost (стоимость нетто),
  // и приложение обещало «остаётся 6566 ₽», когда в кассе после
  // покупки упаковок оставалось на полторы тысячи меньше.
  // Обещать больше денег, чем есть, — то же враньё, что и занижать чек.
  const left = request.budget - purchaseCost;
  const leftShare = request.budget > 0 ? left / request.budget : 0;
  if (leftShare > 0.15) {
    out.push({
      kind: 'info',
      text:
        `Остаётся ${Math.round(left)} ₽. Норма по калориям и белку закрывается ` +
        `дешевле вашего бюджета — можно поднять белок в настройках ` +
        `или взять период подлиннее.`,
    });
  } else if (leftShare >= 0) {
    // Директор просил не молчать про резерв: если денег в обрез,
    // человек должен понимать, что запас на округление упаковок
    // уже заложен, а не гадать, хватит ли в кассе.
    out.push({
      kind: 'info',
      text:
        `Бюджет использован почти полностью: ${Math.round(purchaseCost)} ₽ ` +
        `из ${Math.round(request.budget)} ₽. Цена посчитана по упаковкам — ` +
        `столько и пробьётся на кассе.`,
    });
  }

  out.push({
    kind: 'info',
    text: `Разных блюд в меню: ${demands.length}. Готовка — около ${Math.round(quality.avgMinutesPerDay)} мин в день.`,
  });

  // Честно про упаковки: на коротком горизонте переплата велика,
  // и пользователь должен понимать почему, а не удивляться чеку.
  if (purchaseCost > totalCost * 1.25 && leftoverValue > 0) {
    const overpay = Math.round(purchaseCost - totalCost);
    out.push({
      kind: 'warning',
      text:
        `В магазине выйдет около ${Math.round(purchaseCost)} ₽: продукты продаются ` +
        `упаковками. Излишек на ${overpay} ₽ останется дома — на более длинном ` +
        `плане он окупится. Попробуйте период в 2 недели или месяц.`,
    });
  }

  // Подсказка про выгоду — ТОЛЬКО в режиме экономии.
  //
  // Отзыв: «подсказка "лучший белок за рубль" появляется, когда я
  // не просил экономить. Мне неинтересно». Совет уместен тому, кто
  // считает каждый рубль, и раздражает того, кто уже уложился
  // в бюджет с запасом. Показываем, если израсходовано больше 85%.
  const spentShare = request.budget > 0 ? purchaseCost / request.budget : 0;
  if (spentShare > 0.85) {
    const best = demands
      .filter((d) => d.stats.cost > 0)
      .map((d) => ({ d, ratio: d.stats.nutrients.protein / d.stats.cost }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    if (best) {
      out.push({
        kind: 'value',
        text: `Бюджет почти весь в деле. Самое выгодное блюдо — ${best.d.stats.recipe.name}: ${best.ratio.toFixed(1)} г белка на 1 ₽.`,
      });
    }
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

  // Про «запас» — человеческим языком.
  //
  // Отзыв: «"8 блюд не поместились в расписание — останутся про запас".
  // Что это значит? Я купил еду, которую не съем?» Формулировка звучала
  // как ошибка приложения. Теперь этих порций попросту нет ни в списке
  // покупок, ни в чеке (корзина считается по расписанию), и сказать
  // об этом надо так, чтобы человек не искал подвох.
  if (schedule.unplaced.length > 0) {
    const portions = schedule.unplaced.reduce((sum, u) => sum + u.portions, 0);
    out.push({
      kind: 'info',
      text:
        `Ещё ${portions} ${plural(portions, 'порция', 'порции', 'порций')} не влезли ` +
        `в расписание — приёмов пищи меньше, чем еды. Покупать их не нужно: ` +
        `в список и в чек они не попали.`,
    });
  }

  return out;
}
