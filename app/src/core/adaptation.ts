/**
 * Адаптация под человека: приложение учится на том, что он делает.
 *
 * ЗАЧЕМ. До сих пор приложение было калькулятором: получило параметры,
 * выдало план, забыло. Человек мог сказать «люблю фарш», но не мог
 * сказать «вот это блюдо я готовил и мне не понравилось» — а именно
 * так люди и понимают свои вкусы: не заранее, а по факту.
 *
 * Просить заполнить анкету на 200 блюд бессмысленно, никто не станет.
 * Поэтому учимся на трёх дешёвых для человека действиях:
 *   приготовил   — блюдо подошло, можно предлагать чаще;
 *   пропустил    — не стал готовить, что-то не так;
 *   заменил      — явный сигнал: и что не подошло, и что взамен.
 *
 * Это принцип implicit feedback из рекомендательных систем: наблюдаемое
 * поведение достовернее заявленных предпочтений. Человек говорит,
 * что любит рыбу, а готовит макароны по-флотски — верить надо второму.
 *
 * ВАЖНО: никакого ИИ и никакой отправки данных. Обычные счётчики
 * в localStorage, арифметика на устройстве.
 */

import type { Recipe } from './recipes';
import type { Product } from './types';
import { PRODUCT_BY_ID } from '../data/products';
import type { Liking, Preferences } from './preferences';

/** Что человек сделал с предложенным блюдом. */
export type DishEvent = 'cooked' | 'skipped' | 'swappedOut' | 'swappedIn';

/** Накопленная история по одному блюду. */
export interface DishHistory {
  cooked: number;
  skipped: number;
  swappedOut: number;
  swappedIn: number;
  /** Индекс дня последней подачи — чтобы не приедалось */
  lastSeenDay?: number;
}

export interface AdaptationState {
  /** recipeId → история */
  dishes: Record<string, DishHistory>;
  /** Сколько планов человек построил — мера «зрелости» профиля */
  plansBuilt: number;
}

export function emptyAdaptation(): AdaptationState {
  return { dishes: {}, plansBuilt: 0 };
}

function blank(): DishHistory {
  return { cooked: 0, skipped: 0, swappedOut: 0, swappedIn: 0 };
}

/** Записать действие пользователя. */
export function recordEvent(
  state: AdaptationState,
  recipeId: string,
  event: DishEvent,
): AdaptationState {
  const prev = state.dishes[recipeId] ?? blank();
  return {
    ...state,
    dishes: {
      ...state.dishes,
      [recipeId]: { ...prev, [event]: prev[event] + 1 },
    },
  };
}

/**
 * Насколько блюдо «подходит» человеку по его поведению.
 *
 * Возвращает множитель к оценке предпочтения: 1 — нейтрально,
 * больше — нравится, меньше — нет. Диапазон намеренно узкий
 * (0.35..1.9): поведение — сигнал шумный. Человек мог пропустить
 * блюдо, потому что заболел, а не потому что оно плохое.
 * Явно заданные предпочтения всегда весомее.
 */
export function behaviorScore(state: AdaptationState, recipeId: string): number {
  const h = state.dishes[recipeId];
  if (!h) return 1;

  const positive = h.cooked + h.swappedIn * 1.5;
  const negative = h.skipped * 0.7 + h.swappedOut * 1.5;
  const total = positive + negative;
  // Мало данных — мало доверия. Одно приготовление ещё ничего не значит,
  // а вот пять подряд — уже привычка.
  if (total < 2) return 1;

  const ratio = (positive - negative) / total;
  // сглаживание: чем больше наблюдений, тем сильнее влияние
  const confidence = Math.min(1, total / 6);
  return 1 + ratio * confidence * 0.9;
}

/**
 * Блюда, которые человек последовательно отвергает.
 *
 * Три отказа подряд без единой готовки — достаточный сигнал, чтобы
 * перестать предлагать. Дальше настаивать — раздражать: именно так
 * приложения теряют пользователей (menu fatigue наоборот — не «надоело
 * одно и то же», а «мне постоянно суют то, что я не ем»).
 */
export function rejectedDishes(state: AdaptationState): string[] {
  return Object.entries(state.dishes)
    .filter(([, h]) => h.cooked === 0 && h.skipped + h.swappedOut >= 3)
    .map(([id]) => id);
}

/**
 * Продукты, которые человек явно предпочитает — выводится из блюд.
 *
 * Если человек стабильно готовит блюда с фаршем и пропускает рыбные,
 * приложение должно это заметить само. Возвращает оценку по продуктам,
 * которую можно предложить пользователю подтвердить — не применяя
 * молча: тихое изменение поведения приложения пугает.
 */
export function inferProductLikings(
  state: AdaptationState,
  recipes: Recipe[],
  products: Record<string, Product> = PRODUCT_BY_ID,
): { product: Product; liking: Liking; evidence: number }[] {
  const score = new Map<string, { sum: number; n: number }>();

  for (const recipe of recipes) {
    const h = state.dishes[recipe.id];
    if (!h) continue;
    const positive = h.cooked + h.swappedIn;
    const negative = h.skipped + h.swappedOut;
    if (positive + negative === 0) continue;
    const delta = positive - negative;

    for (const ing of recipe.ingredients) {
      const product = products[ing.productId];
      if (!product) continue;
      // приправы и мелочи не характеризуют вкус
      if (product.tags.includes('condiment')) continue;
      if (ing.grams < 40) continue;
      const cur = score.get(ing.productId) ?? { sum: 0, n: 0 };
      cur.sum += delta;
      cur.n += positive + negative;
      score.set(ing.productId, cur);
    }
  }

  const out: { product: Product; liking: Liking; evidence: number }[] = [];
  for (const [productId, v] of score) {
    const product = products[productId];
    // нужно хотя бы 6 наблюдений, иначе это шум
    if (!product || v.n < 6) continue;
    const rate = v.sum / v.n;
    // Порог 0.7, а не 0.5. При 0.5 обучение объявляло «любимыми»
    // 30 продуктов из 170 — включая лук, муку и картофель, которые
    // человек просто ел, потому что они есть во всём. Это не вкус,
    // а частотность: лук встречается в половине блюд базы.
    // Нам нужны продукты, которые человек выбирает, а не терпит.
    if (rate >= 0.7) out.push({ product, liking: 'often', evidence: v.n });
    else if (rate <= -0.5) out.push({ product, liking: 'rare', evidence: v.n });
  }
  // Не больше восьми выводов: это подсказка о вкусах, а не полная
  // перепись рациона. Слишком много «любимого» = ничего не любимое,
  // плюс накопленные требования делали план невыполнимым.
  return out.sort((a, b) => b.evidence - a.evidence).slice(0, 8);
}

/**
 * Применить накопленное поведение к предпочтениям.
 *
 * Явные оценки пользователя ВСЕГДА важнее выученных: если человек
 * сказал «люблю», а потом трижды пропустил — возможно, дело
 * в сложности рецепта, а не в продукте. Мы понижаем такое блюдо,
 * но не переписываем его оценку.
 */
export function applyAdaptation(
  prefs: Preferences,
  state: AdaptationState,
  recipes: Recipe[] = [],
  products: Record<string, Product> = PRODUCT_BY_ID,
): Preferences {
  const dishes = { ...prefs.dishes };
  for (const id of rejectedDishes(state)) {
    // не трогаем то, что человек отметил сам
    if (!dishes[id]) dishes[id] = 'rare';
  }

  // ВЫУЧЕННЫЕ ПРОДУКТЫ ТОЖЕ ПРИМЕНЯЮТСЯ.
  //
  // Первая версия применяла только отвергнутые блюда, и прогон
  // трёх месяцев показал ровно ноль эффекта: доля мяса стояла
  // на 7.2%, хотя приложение уже «выучило», что человек готовит
  // мясное и пропускает рыбное. Знание собиралось и не использовалось.
  //
  // Отказ от блюда бьёт точечно — по одному рецепту из 210.
  // Предпочтение по продукту поднимает сразу все блюда с ним,
  // а это уже заметно меняет меню.
  const products_ = { ...prefs.products };
  if (recipes.length > 0) {
    for (const { product, liking } of inferProductLikings(state, recipes, products)) {
      // явная оценка человека всегда важнее выученной
      if (!products_[product.id]) products_[product.id] = liking;
    }
  }

  return { dishes, products: products_ };
}
