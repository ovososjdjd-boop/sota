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
  classifyProduct,
  detectMode,
  MODE_PROFILES,
  type BudgetMode,
  type ModeProfile,
  type ProductTier,
} from './tiers';
import { canCook, DEFAULT_EQUIPMENT, type Equipment } from './equipment';
import { behaviorScore, applyAdaptation, type AdaptationState } from './adaptation';
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

/**
 * Разумный потолок готовки, если человек ничего не указал, мин/день.
 *
 * Отсутствие настройки не значит «времени бесконечно». Без лимита
 * прогон давал 111 минут в день и худший день 225 — ровно тот дефект,
 * на который жаловался пользователь в первом отзыве, просто спрятанный
 * за умолчанием.
 *
 * Значение подобрано замером (scripts/limitsweep.ts), компромисс
 * между «успею приготовить» и «хватит калорий»:
 *    60 мин → 2224-2374 ккал (недобор до 11%)
 *    90 мин → 2359-2555 ккал, худший день 103 мин
 *   без лимита → 2599-2663 ккал, но худший день 225 мин
 * Берём 90: норма держится, а четырёхчасовых дней не бывает.
 * Человек всегда может снять ограничение явно — «Не важно» в настройках.
 */
export const DEFAULT_COOKING_LIMIT = 90;

export interface MenuRequest {
  budget: number;
  days: number;
  eaters: EaterProfile[];
  /**
   * Максимум времени готовки в день, мин.
   *
   * Не задан — берётся разумный потолок (см. DEFAULT_COOKING_LIMIT),
   * а НЕ «сколько угодно». Отсутствие настройки не значит, что у
   * человека бесконечно времени: прогон без лимита давал 111 минут
   * в день и худший день 225 — тот же дефект, на который жаловался
   * пользователь в первом отзыве, просто спрятанный за умолчанием.
   *
   * Явный ноль означает «не важно» — это осознанный выбор человека.
   */
  maxCookingMinutes?: number;
  /** Что пользователь любит и что не хочет видеть */
  preferences?: Preferences;
  /** Целевой белок, г/кг веса. Задаётся отдельно от калорий */
  proteinPerKg?: number;
  /**
   * Что есть на кухне. Блюда, которые нечем приготовить,
   * не попадают в меню вовсе.
   */
  equipment?: Equipment[];
  /**
   * Режим рациона. Если не задан — определяется автоматически
   * по отношению бюджета к стоимости минимально приличного рациона.
   * Пользователь может переопределить: «денег немного, но хочу
   * питаться разнообразно» — его право.
   */
  mode?: BudgetMode;
  /**
   * Накопленное поведение: что человек готовил, пропускал, заменял.
   * Приложение подстраивается под факты, а не только под анкету.
   */
  adaptation?: AdaptationState;
}

export interface MenuResult {
  status: 'optimal' | 'budget_too_low' | 'infeasible';
  /** Режим, в котором собрано меню — показывается пользователю */
  mode: BudgetMode;
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

  // ОТБОР ПРОДУКТОВ ДЛЯ ТОЧНОЙ МОДЕЛИ УПАКОВОК.
  //
  // Каждый продукт добавляет по целой переменной на фасовку. При базе
  // в 170 продуктов это сотни целочисленных переменных, и MILP
  // перестаёт укладываться в бюджет времени: солвер отдаёт сырое
  // решение по таймауту (замер: «Time limit reached», в меню
  // ни одного деликатеса — просто не успел их перебрать).
  //
  // Точность нужна не везде. Переплата за упаковку велика там, где
  // пачка большая и дорогая: мясо, рыба, сыр. На соли и специях
  // «хвост» стоит копейки, и моделировать его целыми переменными —
  // тратить время солвера впустую. Оставляем 45 самых «дорогих
  // по упаковке» продуктов, остальные учитываются приблизительно.
  const ranked = [...byProduct.entries()]
    .map(([productId, perDish]) => {
      const product = PRODUCT_BY_ID[productId];
      if (!product || product.packSizes.length === 0) return null;
      const minPack = Math.min(...product.packSizes);
      // цена минимальной фасовки — верхняя оценка возможного «хвоста»
      return { productId, perDish, weight: (minPack / 1000) * product.pricePerKg };
    })
    .filter((x): x is { productId: string; perDish: { i: number; grams: number }[]; weight: number } => x !== null)
    .sort((a, b) => b.weight - a.weight)
    // 20, а не 45. Замер: при 45 продуктах модель имела 235 целых
    // переменных, и солвер стабильно возвращал «Time limit reached» —
    // то есть отдавал ПЕРВОЕ попавшееся допустимое решение, не успев
    // его улучшить. Это выглядело как «предпочтения не работают»:
    // отметка «люблю мясо» не меняла рацион вообще (7.4% против 7.5%),
    // потому что до учёта наград дело просто не доходило.
    //
    // Двадцати самых дорогих по упаковке продуктов достаточно:
    // именно на мясе, рыбе и сыре возникает основная переплата,
    // а на крупах и овощах она копеечная.
    .slice(0, 20);

  const out: PackVar[] = [];
  let n = 0;
  for (const { productId, perDish } of ranked) {
    const product = PRODUCT_BY_ID[productId];
    if (!product) continue;

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
function maxPortionsFor(
  recipe: Recipe,
  days: number,
  eaters: number,
  preference = 1,
): number {
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
  // Любимое блюдо человек готов есть чаще — в этом и смысл отметки
  // «люблю». Без поблажки правило неповторения давало жёсткие
  // 6 подач за месяц любому блюду, и предпочтения не работали:
  // награда в целевой функции была, а места для неё не было.
  // Полуторный запас, а не снятие лимита: приедание реально,
  // и человек, отметивший пять любимых блюд, не должен получить
  // меню из пяти блюд.
  const bonus = preference > 1.2 ? 1.6 : 1;
  return Math.max(1, Math.round(servings * eaters * bonus));
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
   * Профиль режима рациона. Определяет не «сколько экономить»,
   * а ЧЕГО ДОБИВАТЬСЯ: экономному важно не скатиться в пустые калории,
   * свободному — потратить деньги на качество и разнообразие.
   */
  modeProfile: ModeProfile = MODE_PROFILES.balanced,
  /** Явные предпочтения — из них выводятся требования по категориям */
  prefs: Preferences = emptyPreferences(),
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
  // Режим задаётся снаружи (core/tiers.ts) и определяет всю политику:
  // насколько экономить, сколько платить за качество и разнообразие.
  const isTight = modeProfile.thriftWeight > 0.3;

  if (budget > 0) {
    // Штраф за трату денег. В экономном режиме он сильный — иначе
    // не уложиться; в свободном равен нулю: там экономить незачем.
    const perRuble = modeProfile.thriftWeight / budget;
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
      // Вес зависит от режима.
      //
      // Найденный дефект: штраф за остатки, задуманный против
      // расточительства, наглухо блокировал дорогие продукты.
      // У них крупная фасовка: лосось на 6 порций даёт «хвост»
      // на 1312 ₽ (73% стоимости), боул с киноа — 95%. При весе 3.5
      // это перевешивало любую награду, и при бюджете 35 000 ₽
      // в меню не попадало НИ ОДНОГО деликатеса из девяти —
      // даже когда пользователь явно отмечал их как любимые.
      //
      // Логика режима: экономному человеку выброшенная еда —
      // прямой удар по бюджету, там штраф высокий. Тому, у кого
      // денег вдвое больше нужного, остаток пачки пармезана
      // не проблема: он доест её в следующем месяце.
      const WASTE_WEIGHT =
        modeProfile.mode === 'lean' ? 4.5 : modeProfile.mode === 'balanced' ? 3 : 0.8;
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
  //
  // МАСШТАБ. Вес 6 за порцию не работал: рядом в цели стоит награда
  // за качественный белок (120-170 единиц) и штрафы за отклонение
  // от КБЖУ, отмасштабированные к тысячам килокалорий. На их фоне
  // «шесть» терялось, и отметка «люблю мясо» не меняла рацион вообще
  // (замер: 7.4% против 7.5%). Приводим к тому же масштабу, что
  // остальные слагаемые, — иначе предпочтения остаются декорацией.
  //
  // Награда пропорциональна КАЛОРИЙНОСТИ блюда, а не фиксирована.
  //
  // Фиксированная награда за порцию проигрывала по построению: солверу
  // выгоднее взять шесть порций дешёвого лёгкого блюда, чем три порции
  // любимого сытного, — суммарный бонус больше, а калории те же.
  // Поэтому «люблю мясо» не меняло рацион (замер: 7.4% против 7.5%),
  // хотя предпочтение доходило до модели правильно (множитель 1.6).
  //
  // Привязка к калорийности убирает этот перекос: бонус получает
  // не «побольше штук», а «побольше еды из любимых продуктов».
  const prefScale = 26;
  const kcalNorm = Math.max(1, targets.kcal.target / candidates.length);
  candidates.forEach((c, i) => {
    const delta = c.preference - 1;
    if (Math.abs(delta) > 0.01) {
      const weight = Math.min(3, c.stats.nutrients.kcal / kcalNorm);
      const bonus = delta * prefScale * weight;
      objTerms.push(`${bonus > 0 ? '-' : ''}${Math.abs(bonus).toFixed(6)} x${i}`);
    }
  });

  // Награда за качественный белок — главное, на что тратится бюджет.
  //
  // Вес поднят с 45 до 140 на свободном бюджете: прежнего не хватало,
  // чтобы перебить штраф за трату денег, и рацион не менялся вообще
  // при росте бюджета втрое. Мясо, рыба, творог дороже круп —
  // без сильной награды солвер их просто не берёт.
  const qWeight = modeProfile.qualityWeight;
  const qScale = qWeight / Math.max(1, targets.protein.target);
  candidates.forEach((c, i) => {
    let qp = 0;
    for (const cat of PROTEIN_CATEGORIES) {
      qp += c.stats.categoryKcal[cat] ? proteinFromCategory(c.stats, cat) : 0;
    }
    if (qp > 0) objTerms.push(`-${(qScale * qp).toFixed(9)} x${i}`);
  });

  // НАГРАДА ЗА «ВКУСНОЕ» — то, ради чего человек платит.
  //
  // Потолок доли треатов сам по себе ничего не даёт: он РАЗРЕШАЕТ,
  // но не побуждает. Прогон при бюджете 35 000 ₽ показал ноль
  // деликатесных блюд в меню — приложение снова молча экономило,
  // хотя денег было вдвое больше нужного.
  //
  // Награда пропорциональна «свободе» режима: в экономном её нет
  // (там каждый рубль нужен на белок и овощи), в свободном она
  // заметная. Считается по индикатору использования блюда, а не
  // по порциям: цель — чтобы деликатесы ПОЯВЛЯЛИСЬ в меню
  // время от времени, а не заменили собой весь рацион.
  const treatReward = modeProfile.maxTreatShare >= 0.15 ? modeProfile.varietyWeight * 1.6 : 0;

  // Награда за РАЗНООБРАЗИЕ рациона при свободных деньгах.
  //
  // Без неё солвер, получив задачу «набери побольше белка», сваливается
  // в одно самое белково-выгодное блюдо и готовит его весь месяц.
  // Разнообразие — прямой фактор удержания (78% против 52%,
  // см. docs/COMPETITORS.md), поэтому оплачиваем его явно: каждое
  // РАЗНОЕ блюдо в меню чуть улучшает цель. Считается по индикатору
  // использования u_i (см. ниже, ограничение use_*), а не по порциям —
  // иначе «разнообразие» набирается одним блюдом в 30 порциях.
  const varietyBonus = modeProfile.varietyWeight;
  const useVars = integer && varietyBonus > 0;
  if (useVars) {
    candidates.forEach((c, i) => {
      let bonus = varietyBonus;
      // деликатесы получают надбавку — иначе солвер их не берёт:
      // они дороже, а по КБЖУ ничем не лучше обычных блюд
      if (treatReward > 0 && c.stats.recipe.tags.includes('delicacy')) {
        bonus += treatReward;
      }
      objTerms.push(`-${bonus.toFixed(6)} u${i}`);
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

  // ── ОГРАНИЧЕНИЯ ПО КЛАССАМ ПРОДУКТОВ ──
  //
  // Категория отвечает на вопрос «что это» (мясо, крупа), класс —
  // «зачем это в рационе»: основа, необходимое, вкусное, сладости.
  // Именно класс отличает режимы друг от друга.
  //
  // Ключевая мысль экономного режима: опасность не в перерасходе,
  // а в скатывании в дешёвые пустые калории. Поэтому там САМАЯ
  // высокая планка по «необходимому» (белок, овощи, молочное)
  // и жёсткий потолок на удовольствия — тратить последние деньги
  // на сыр и орехи, недобрав белка, человеку во вред.
  //
  // В свободном режиме наоборот: потолок «вкусного» широкий,
  // потому что ради него человек и платит. Но лимит на сладости
  // почти не меняется — рекомендации ВОЗ одинаковы для всех.
  const totalKcal = targets.kcal.target;

  const tierKcal = (c: DishCandidate, tier: ProductTier): number => {
    let sum = 0;
    for (const ing of c.stats.recipe.ingredients) {
      const product = PRODUCT_BY_ID[ing.productId];
      if (!product || classifyProduct(product) !== tier) continue;
      sum += (product.per100g.kcal * ing.grams) / 100;
    }
    return sum;
  };

  const tierTerms = (tier: ProductTier): string =>
    candidates
      .map((c, i) => {
        const v = tierKcal(c, tier);
        return v > 0 ? `${v.toFixed(6)} x${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');

  const treatTerms = tierTerms('treat');
  if (treatTerms) {
    lines.push(
      ` tier_treat: ${treatTerms} <= ${(totalKcal * modeProfile.maxTreatShare).toFixed(2)}`,
    );
  }
  const indulgenceTerms = tierTerms('indulgence');
  if (indulgenceTerms) {
    lines.push(
      ` tier_sweet: ${indulgenceTerms} <= ${(totalKcal * modeProfile.maxIndulgenceShare).toFixed(2)}`,
    );
  }
  const essentialTerms = tierTerms('essential');
  if (essentialTerms) {
    lines.push(
      ` tier_essential: ${essentialTerms} >= ` +
        `${(totalKcal * modeProfile.minEssentialShare * minSlack).toFixed(2)}`,
    );
  }

  // ── ПРЯМОЕ ТРЕБОВАНИЕ ПО ЛЮБИМЫМ ПРОДУКТАМ ──
  //
  // Награды в целевой функции оказалось мало. Она работает как «при
  // прочих равных предпочти это», но прочие никогда не равны: рядом
  // штрафы за КБЖУ, остатки упаковок и лимиты разнообразия. Замер
  // показал, что отметка «люблю мясо» сдвигала долю мяса с 7.2%
  // до 7.5% — то есть практически никак.
  //
  // Человек, отметивший продукт как любимый, просит не «немного
  // приоритета», а чтобы этот продукт был в рационе заметно.
  // Поэтому переводим просьбу в ограничение: доля энергии из любимых
  // категорий не ниже полуторной от обычной. Это тот же механизм,
  // которым уже гарантируется минимум мяса и рыбы вообще.
  //
  // ОГРАНИЧЕНИЕ НА ЧИСЛО ТРЕБОВАНИЙ. Когда человек (или обучение
  // по его поведению) отмечает много продуктов, требования по каждой
  // категории складываются и делают задачу невыполнимой: прогон
  // трёх месяцев адаптации давал budget_too_low уже на втором месяце.
  //
  // Смысл отметки «люблю» — приоритет, а не гарантия каждому продукту.
  // Берём не больше трёх категорий: этого хватает, чтобы рацион
  // ощутимо сместился, и мало, чтобы он остался выполнимым.
  const likedCategories = new Set<ProductCategory>();
  for (const [productId, liking] of Object.entries(prefs.products)) {
    if (liking !== 'often' && liking !== 'always') continue;
    const product = PRODUCT_BY_ID[productId];
    if (product) likedCategories.add(product.category);
  }
  // приоритет — белковым категориям: именно их обычно и просят
  const likedOrdered = [...likedCategories]
    .sort(
      (a, b) =>
        Number(PROTEIN_CATEGORIES.includes(b)) - Number(PROTEIN_CATEGORIES.includes(a)),
    )
    .slice(0, 3);
  for (const category of likedOrdered) {
    const rule = CATEGORY_RULES[category];
    if (!rule || rule.minEnergyShare <= 0) continue;
    const terms = candidates
      .map((c, i) => {
        const v = c.stats.categoryKcal[category] ?? 0;
        return v > 0 ? `${v.toFixed(6)} x${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');
    if (!terms) continue;
    // 2.2× обычного минимума, но не выше половины разрешённого потолка:
    // просьба не должна ломать сбалансированность рациона
    const want = Math.min(
      rule.minEnergyShare * 2.2,
      rule.maxEnergyShare * 0.5,
    );
    lines.push(
      ` liked_${category}: ${terms} >= ${(targets.kcal.target * want * minSlack).toFixed(2)}`,
    );
  }

  // ── ТРЕБОВАНИЕ ПО КОНКРЕТНОМУ ПРОДУКТУ ──
  //
  // Отзыв: «Я отметил фарш любимым — он попал в ОДНО блюдо из 36.
  // Двенадцать блюд с фаршем мне не показали ни разу».
  //
  // Причина: требование выше задано на КАТЕГОРИЮ («мясо»), а его
  // прекрасно закрывает курица. Человек говорил «фарш», приложение
  // слышало «мясо вообще» — и брало то, что выгоднее по белку
  // на рубль. Отсюда соевый гуляш вместо котлет.
  //
  // Отметка на продукте должна означать сам продукт. Требуем, чтобы
  // каждый явно любимый продукт реально присутствовал в рационе.
  // Порог скромный: это «покажи мне это регулярно», а не «корми
  // меня только этим».
  const likedProducts = Object.entries(prefs.products)
    .filter(([, liking]) => liking === 'often' || liking === 'always')
    .map(([productId]) => productId)
    .filter((id) => PRODUCT_BY_ID[id])
    // Не больше трёх: требования складываются, и при пяти любимых
    // продуктах по 25 г/день план становился невыполнимым
    // (budget_too_low). Три — та граница, где просьба ещё слышна,
    // а рацион ещё собирается.
    .slice(0, 3);

  for (const productId of likedProducts) {
    const product = PRODUCT_BY_ID[productId];
    // приправы отмечать «любимыми» бессмысленно: их едят граммами
    if (!product || product.tags.includes('condiment')) continue;

    const terms = candidates
      .map((c, i) => {
        const grams = c.stats.recipe.ingredients
          .filter((ing) => ing.productId === productId)
          .reduce((sum, ing) => sum + ing.grams, 0);
        return grams > 0 ? `${grams.toFixed(3)} x${i}` : null;
      })
      .filter(Boolean)
      .join(' + ');
    if (!terms) continue;

    // Сколько граммов любимого продукта хочется видеть за период.
    // 15 г на человека в день — это порция раз в 4-5 дней в составе
    // блюда. Мало для «надоел», достаточно для «он есть в меню».
    // При 25 г три продукта уже не помещались в бюджет.
    const wantGrams = 15 * personDays * minSlack;
    lines.push(` likedp_${productId}: ${terms} >= ${wantGrams.toFixed(1)}`);

    // РАЗНЫЕ БЛЮДА, А НЕ ОДНО ПОБОЛЬШЕ.
    //
    // Требования по граммам мало: солвер закрывал его одним
    // «Чечевичным супом с фаршем» девять раз подряд. Формально фарш
    // в рационе есть, по факту человек ест один и тот же суп —
    // ровно то, на что жаловались в отзыве.
    //
    // Поэтому требуем РАЗНООБРАЗИЕ носителей: минимум три разных
    // блюда с этим продуктом (если они вообще есть в шорт-листе).
    // Считаем по индикаторам использования u_i, а не по порциям.
    if (useVars && integer) {
      const carriers = candidates
        .map((c, i) => ({ c, i }))
        .filter(({ c }) =>
          c.stats.recipe.ingredients.some(
            (ing) => ing.productId === productId && ing.grams >= 40,
          ),
        );
      if (carriers.length >= 3) {
        const need = Math.min(3, Math.max(1, Math.floor(carriers.length / 2)));
        lines.push(
          ` likedv_${productId}: ${carriers.map(({ i }) => `u${i}`).join(' + ')}` +
            ` >= ${Math.max(1, Math.round(need * minSlack))}`,
        );
      }
    }
  }

  // ── кулинарные ограничения на уровне категорий ингредиентов ──
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
    // ЛЮБИМЫМ БЛЮДАМ — БОЛЬШЕ МЕСТА.
    //
    // Найденный дефект: отметка «люблю мясо» не меняла рацион вообще
    // (7.4% против 7.5%). Причина не в весах целевой функции, а в этом
    // ограничении: лимит 5% энергии на блюдо одинаков для всех,
    // и любимое блюдо упиралось в тот же потолок, что и случайное.
    // Награда толкала солвер к мясу, ограничение не пускало.
    //
    // Человек, попросивший больше мяса, готов есть его чаще — это
    // и есть смысл просьбы. Разнообразие при этом не рушится:
    // потолок растёт в полтора раза, а не снимается.
    const shareLimit = c.preference > 1.2 ? maxDishShare * 1.6 : maxDishShare;
    const k = c.stats.nutrients.kcal;
    if (k > 0) {
      lines.push(
        ` var_${i}: ${k.toFixed(6)} x${i} <= ${(totalKcal * shareLimit).toFixed(2)}`,
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
  // Явные предпочтения плюс выученные: блюда, от которых человек
  // трижды отказался, понижаются автоматически.
  const prefs = request.adaptation
    ? applyAdaptation(
        request.preferences ?? emptyPreferences(),
        request.adaptation,
        recipes,
        products,
      )
    : (request.preferences ?? emptyPreferences());

  const dietTags = [...new Set(request.eaters.flatMap((e) => e.dietTags))];
  const allExcluded = new Set([
    ...excludedProducts,
    ...request.eaters.flatMap((e) => e.excludedProducts),
  ]);

  // Чем человек может готовить. Блюда, которые нечем приготовить,
  // отбрасываются до оптимизации: предлагать запеканку тому,
  // у кого нет духовки, — значит сломать план на первом же дне.
  const equipment = request.equipment ?? DEFAULT_EQUIPMENT;

  // Эффективный лимит времени: явный ноль — «не важно», отсутствие
  // настройки — разумный потолок, а не бесконечность.
  //
  // Для семьи потолок выше: готовка на четверых занимает больше времени,
  // чем на одного, — та же кастрюля, но больше нарезки и больше блюд
  // в день. Прогон с жёсткими 90 минутами на семью из четырёх дал
  // пустые приёмы пищи: еду было некогда приготовить.
  // Растём не пропорционально едокам (кастрюля одна), а мягко.
  const cookingLimit =
    request.maxCookingMinutes === undefined
      ? Math.round(DEFAULT_COOKING_LIMIT * (1 + (request.eaters.length - 1) * 0.25))
      : request.maxCookingMinutes;

  // ── подготовка кандидатов ──
  const candidates: DishCandidate[] = [];
  for (const recipe of recipes) {
    if (hasExcluded(recipe, allExcluded)) continue;
    if (!canCook(recipe.requires, equipment)) continue;
    const stats = computeRecipeStats(recipe, products);
    if (!stats.valid || stats.nutrients.kcal <= 0) continue;
    if (!matchesDietTags(stats, dietTags, products)) continue;
    const declared = dishPreference(recipe, prefs, products);
    // «не предлагать» — блюдо вообще не рассматривается
    if (declared === 0) continue;
    // Поведение корректирует заявленное: человек говорит, что любит
    // рыбу, а готовит макароны по-флотски — верить надо второму.
    // Множитель узкий, чтобы случайный пропуск не менял картину.
    //
    // ПОТОЛОК 2.9 ОБЯЗАТЕЛЕН. Значение 3 и выше означает «подавать
    // каждый день» — это осознанная команда человека («кофе по утрам»),
    // и она снимает лимиты разнообразия и добавляет жёсткое требование
    // «ровно N порций». Произведение 1.6 (люблю) × 1.9 (готовлю) = 3.04
    // молча превращало обычное блюдо в обязательное, и после месяца
    // обучения план становился невыполнимым (budget_too_low).
    // Выученное поведение не должно давать команд, которых человек
    // не отдавал.
    const preference = request.adaptation
      ? Math.min(2.9, declared * behaviorScore(request.adaptation, recipe.id))
      : declared;

    const maxPortions =
      preference >= 3
        ? request.days * request.eaters.length
        : maxPortionsFor(recipe, request.days, request.eaters.length, preference);
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

  // ── РЕЖИМ РАЦИОНА ──
  //
  // Определяется по отношению бюджета к стоимости минимально приличного
  // рациона НА ЭТИХ ЖЕ ЦЕНАХ И ЭТОЙ БАЗЕ — не по абсолютной сумме.
  // Так классификация переживёт инфляцию, региональные различия
  // и правку цен пользователем.
  // Оценка «сколько стоит закрыть норму скромно».
  //
  // Первая версия брала САМОЕ дешёвое блюдо базы и умножала на калории.
  // Это давало заниженную вдвое оценку (3814 ₽ в месяц), потому что
  // питаться одним самым дешёвым блюдом невозможно — правила
  // разнообразия и структуры приёмов этого не позволят. В итоге
  // 5000 ₽ на неделю классифицировались как «свободный бюджет»,
  // и приложение начинало покупать деликатесы вместо еды: 1581 ккал
  // в день вместо 2500.
  //
  // Берём медиану по 25% самых дешёвых блюд — это реалистичная
  // стоимость скромного, но исполнимого рациона.
  const perKcal = candidates
    .filter((c) => c.stats.nutrients.kcal > 0)
    .map((c) => c.stats.cost / c.stats.nutrients.kcal)
    .sort((a, b) => a - b);
  const cheapestPerKcal = perKcal.length
    ? perKcal[Math.floor(perKcal.length * 0.125)]
    : 0;
  const survivalCost = cheapestPerKcal * targets.kcal.target;
  const mode: BudgetMode = request.mode ?? detectMode(request.budget, survivalCost);
  const modeProfile = MODE_PROFILES[mode];

  const emptyResult = (
    status: MenuResult['status'],
    explanations: Explanation[],
    minimumFeasibleBudget?: number,
  ): MenuResult => ({
    status,
    mode,
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
    cookingLimit,
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

  // Сужение границ по LP + шорт-лист. База выросла до 210 блюд,
  // и MILP на всех кандидатах не укладывается в бюджет времени.
  // LP-релаксация подсказывает, какие блюда перспективны.
  const scored = candidates
    .map((c, i) => ({ c, v: lp.Columns?.[`x${i}`]?.Primal ?? 0, i }))
    .sort((a, b) => b.v - a.v);

  // Размер шорт-листа — компромисс между качеством и временем.
  //
  // База выросла до 210 блюд, и MILP перестал успевать за отведённые
  // 2 секунды: солвер возвращал «Time limit reached» с сырым решением,
  // в котором не было ни одного деликатеса — просто не дошли руки
  // их попробовать. Это выглядело как «модель их не хочет», хотя
  // награда была на месте: дефект был во времени, а не в весах.
  //
  // 60 кандидатов вместо 90 сокращают перебор вчетверо и дают солверу
  // дойти до оптимума. Разнообразие при этом не страдает: добор
  // по ролям и резерв под деликатесы работают поверх этого числа.
  // 35, а не 60. Замер показал: при 60 кандидатах MILP стабильно
  // возвращал «Time limit reached», то есть отдавал первое допустимое
  // решение, не успев его улучшить. Награды и предпочтения при этом
  // просто не успевали проявиться. Меньше кандидатов — хуже теоретический
  // оптимум, но solver до него доходит, и результат на практике лучше.
  const SHORTLIST = 35;
  const keep = new Set(scored.slice(0, SHORTLIST).map((x) => x.i));
  // добираем разнообразие: минимум по 8 блюд каждой роли
  const byRole = new Map<string, number>();
  for (const { c, i } of scored) {
    const role = c.stats.recipe.role;
    const n = byRole.get(role) ?? 0;
    if (n < 6) {
      keep.add(i);
      byRole.set(role, n + 1);
    }
  }

  // ДЕЛИКАТЕСЫ ПРОПУСКАЕМ В ШОРТ-ЛИСТ ОТДЕЛЬНО.
  //
  // Найденный дефект: при бюджете 35 000 ₽ в меню не попадало
  // ни одного деликатесного блюда из девяти. Награда за них есть,
  // но она живёт в MILP, а шорт-лист формируется по LP-релаксации,
  // где этой награды нет. Дорогие блюда отсеивались ещё до того,
  // как модель могла их оценить, — приложение снова молча экономило.
  //
  // В свободном режиме резервируем им места: без этого весь смысл
  // режима «трать деньги на качество» пропадает.
  if (modeProfile.maxTreatShare >= 0.15) {
    let added = 0;
    for (const { c, i } of scored) {
      if (added >= 10) break;
      if (!c.stats.recipe.tags.includes('delicacy')) continue;
      if (keep.has(i)) continue;
      keep.add(i);
      added++;
    }
  }

  // ЛЮБИМЫЕ ПРОДУКТЫ — ТОЖЕ РЕЗЕРВИРУЕМ МЕСТА.
  //
  // Отзыв: «отметил фарш любимым, он попал в ОДНО блюдо из 36,
  // двенадцать блюд с фаршем не показали ни разу». Замер подтвердил:
  // из 12 блюд с фаршем в шорт-лист доходило РОВНО ОДНО.
  //
  // Механика та же, что была с деликатесами: шорт-лист отбирается
  // по LP-релаксации, а предпочтения живут в MILP. Блюда отсеивались
  // раньше, чем модель успевала понять, что человек их просил.
  // Награды и ограничения при этом были настроены верно — они просто
  // применялись к пустому множеству.
  const likedIds = Object.entries(prefs.products)
    .filter(([, v]) => v === 'often' || v === 'always')
    .map(([id]) => id);
  if (likedIds.length > 0) {
    for (const productId of likedIds.slice(0, 3)) {
      let added = 0;
      for (const { c, i } of scored) {
        if (added >= 5) break;
        if (keep.has(i)) continue;
        const grams = c.stats.recipe.ingredients
          .filter((ing) => ing.productId === productId)
          .reduce((sum, ing) => sum + ing.grams, 0);
        // 40 г — порог «продукт заметен в блюде», а не приправа
        if (grams < 40) continue;
        keep.add(i);
        added++;
      }
    }
  }

  const bounded = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => keep.has(i))
    .map(({ c, i }) => ({
      ...c,
      // Сужение границ по LP ускоряет MILP, но у него есть цена:
      // потолок в 6 порций получало и любимое блюдо тоже. Отметка
      // «люблю мясо» не меняла рацион вообще (7.4% против 7.5%) —
      // награда в целевой функции была (−9.2 против −0.65), но упиралась
      // в этот потолок и не могла ничего изменить. Любимым блюдам
      // даём запас вдвое: они и должны появляться чаще.
      maxPortions: Math.min(
        c.maxPortions,
        Math.max(
          Math.ceil((lp.Columns?.[`x${i}`]?.Primal ?? 0) * 2) + (c.preference > 1.2 ? 12 : 6),
          c.preference > 1.2 ? 12 : 6,
        ),
      ),
    }));


  const milpModel = buildDishModel(
    bounded,
    targets,
    request.budget,
    personDays,
    true,
    cookingLimit,
    request.days,
    request.eaters.length,
    1,
    modeProfile,
    prefs,
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

  // ── ДОБОР ДЕЛИКАТЕСОВ В СВОБОДНОМ РЕЖИМЕ ──
  //
  // Задача выросла вместе с базой, и MILP стабильно упирается
  // в лимит времени: возвращает «Time limit reached» с решением,
  // где деликатесов нет — солвер до них просто не добрался.
  // Награда и потолки при этом настроены верно, дефект во времени.
  //
  // Ждать дольше нельзя (приоритет — телефон, 2.5 с на весь расчёт),
  // поэтому решаем узкую задачу отдельно и дёшево: берём несколько
  // самых уместных дорогих блюд и добавляем их в план вручную,
  // укладываясь в свободные деньги. Это ровно то, чего ждёт человек
  // с большим бюджетом: «покажи мне что-то интересное», а не
  // «вот тебе снова творог, зато математически оптимально».
  // Добор идёт ТОЛЬКО поверх выполненной нормы. Если калорий не хватает,
  // деньги нужны на еду, а не на украшения: прогон показал, что без
  // этой проверки недельный план проседал до 1561 ккал/день — солвер
  // отдавал бюджет под деликатесы, недокормив человека на 38%.
  const kcalDone = demands.reduce(
    (sum, d) => sum + d.stats.nutrients.kcal * d.portions,
    0,
  );
  const kcalOk = kcalDone >= targets.kcal.target * 0.95;

  if (modeProfile.maxTreatShare >= 0.15 && request.budget > 0 && kcalOk) {
    const already = new Set(demands.map((d) => d.stats.recipe.id));

    /**
     * Фактический чек набора блюд — по упаковкам, как в списке покупок.
     *
     * Оценивать «свободные деньги» через средний коэффициент упаковок
     * нельзя: у деликатесов «хвосты» доходят до 95% стоимости (лосось,
     * киноа — крупные дорогие пачки). С коэффициентом 1.35 добор
     * выводил двухнедельный план на чек 10 139 ₽ при бюджете 7 000,
     * страховка срезала треть еды, и человек получал 1663 ккал/день.
     * Считаем точно и проверяем каждое добавление.
     */
    const costOf = (list: DishDemand[]): number => {
      const need: Record<string, number> = {};
      for (const d of list) {
        for (const ing of d.stats.recipe.ingredients) {
          need[ing.productId] = (need[ing.productId] ?? 0) + ing.grams * d.portions;
        }
      }
      let sum = 0;
      for (const [pid, grams] of Object.entries(need)) {
        const product = products[pid];
        if (!product) continue;
        const packs = packsNeeded(product, grossFromNet(product, grams));
        sum += (packs.totalGrams / 1000) * product.pricePerKg;
      }
      return sum;
    };

    const treats = bounded
      .filter((c) => c.stats.recipe.tags.includes('delicacy'))
      .filter((c) => !already.has(c.stats.recipe.id))
      // сначала те, что нравятся человеку, затем — дающие больше белка
      .sort(
        (a, b) =>
          b.preference - a.preference ||
          b.stats.nutrients.protein / b.stats.cost - a.stats.nutrients.protein / a.stats.cost,
      );

    // Не больше одной подачи в 3 дня: это украшение рациона, а не основа.
    const maxTreatServings = Math.max(1, Math.floor(request.days / 3));
    let placed = 0;
    for (const c of treats) {
      if (placed >= maxTreatServings) break;
      const portions = Math.min(
        request.eaters.length * Math.max(1, Math.floor(request.days / 10)),
        maxTreatServings - placed,
      );
      if (portions < 1) continue;
      const candidate: DishDemand = { stats: c.stats, portions, daily: false };
      // добавляем, только если реальный чек остаётся в бюджете
      if (costOf([...demands, candidate]) > request.budget) continue;
      demands.push(candidate);
      placed += portions;
    }
  }

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
    cookingLimit,
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
        cookingLimit,
        request.days,
        request.eaters.length,
        slack,
        modeProfile,
        prefs,
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
      cookingLimit,
    );

    // принимаем итерацию, только если расписание стало полнее по еде
    const kcalOf = (s: typeof schedule) =>
      s.days.reduce((sum, d) => sum + d.nutrients.kcal, 0);
    if (kcalOf(nextSchedule) <= kcalOf(schedule)) break;

    // ...и только если чек укладывается в бюджет. Модель считает
    // упаковки приближённо, поэтому сверяемся с фактом: бюджет —
    // главное обещание приложения.
    //
    // Важно: здесь именно `continue`, а не `break`. Раньше стоял
    // выход из цикла, и первая же дорогая итерация обрывала подгонку
    // насовсем — двухнедельный план застревал на 66% нормы
    // (1663 ккал/день), хотя следующая итерация урезала бы лишнее
    // и уложилась в деньги. Отвергаем плохой вариант, но продолжаем
    // искать: цель цикла — накормить человека, а не сдаться.
    if (request.budget > 0 && actualPurchaseCost(nextSchedule) > request.budget) {
      continue;
    }

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
    mode,
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
      request.maxCookingMinutes ?? DEFAULT_COOKING_LIMIT,
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
    // Совет «возьмите период подлиннее» уместен только тому, у кого
    // период короткий. На месячном плане он звучал абсурдно:
    // «попробуйте период в 2 недели или месяц» — а это и есть месяц.
    const advice =
      request.days < 14
        ? ' Попробуйте период в 2 недели или месяц — переплата станет меньше.'
        : ' Это не потеря: остаток пойдёт в дело в следующем месяце.';
    out.push({
      kind: 'warning',
      text:
        `В магазине выйдет около ${Math.round(purchaseCost)} ₽: продукты продаются ` +
        `упаковками. Излишек на ${overpay} ₽ останется дома.` +
        advice,
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
