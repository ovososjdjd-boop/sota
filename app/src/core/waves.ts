/**
 * Волны закупки: когда идти в магазин и что брать.
 *
 * Отзыв пользователя: «46 позиций, 13 553 ₽. Среди них молоко 14.6 кг
 * со сроком хранения 7 дней, свинина 1.2 кг (4 дня), бананы 2 кг.
 * Как я это донесу и где буду хранить? Приложение знает про сроки —
 * они есть в карточке продукта, — но список один на весь месяц».
 *
 * Задача не сводится к «поделить список на N частей». Продукты ведут
 * себя по-разному:
 *   крупы, масло, консервы — берутся один раз на весь период, так
 *     дешевле: большая фасовка выгоднее, а испортиться не успеет;
 *   мясо, молоко, хлеб, фрукты — только на ближайшие дни, иначе
 *     пропадут; их закупка повторяется каждую волну.
 *
 * Поэтому волна — это не «четверть списка», а ответ на вопрос
 * «что нужно докупить именно сейчас, чтобы дожить до следующего раза».
 * Расчёт идёт от РАСПИСАНИЯ: берём блюда конкретных дней и смотрим,
 * какие продукты они требуют.
 */

import type { Product } from './types';
import type { MenuSchedule } from './menu';
import { PRODUCT_BY_ID } from '../data/products';
import { grossFromNet, packsNeeded } from './measures';

export interface WaveLine {
  product: Product;
  /** Сколько граммов нужно по рецептам этой волны (нетто) */
  neededGrams: number;
  /** Сколько купить с учётом фасовки, г */
  buyGrams: number;
  packs: number;
  packSize: number;
  cost: number;
  /** Остаток, который перейдёт в следующую волну, г */
  carryOver: number;
  /** Хватит ли срока хранения до конца волны */
  fitsShelfLife: boolean;
  /**
   * Что делать, если не хватает.
   *
   * «Не доживёт» — бесполезное предупреждение: человек не виноват,
   * что фарш хранится два дня, и убрать его из меню не готов.
   * Полезный ответ — как поступить: мясо и рыбу можно заморозить
   * сразу после покупки, и это нормальная бытовая практика.
   * Для хлеба и молочного заморозка не годится — там честнее
   * предложить докупить по дороге.
   */
  advice?: 'freeze' | 'buyLater';
}

/** Категории, которые нормально переносят заморозку. */
const FREEZABLE = new Set(['meat', 'fish', 'bread']);

export interface ShoppingWave {
  index: number;
  /** День периода, в который идти в магазин (0-based) */
  dayIndex: number;
  /** Сколько дней покрывает волна */
  coversDays: number;
  lines: WaveLine[];
  cost: number;
}

/**
 * Длина волны по умолчанию — неделя.
 *
 * Почему именно неделя, а не срок хранения самого скоропортящегося
 * продукта: поход в магазин стоит человеку времени, и раз в 3 дня
 * никто ходить не станет. Неделя — привычный бытовой ритм, на нём же
 * строятся все конкуренты (docs/COMPETITORS.md). Продукты со сроком
 * меньше недели помечаются отдельно, а не дробят весь план.
 */
export const DEFAULT_WAVE_DAYS = 7;

/**
 * Разбить закупку на волны по расписанию меню.
 *
 * @param pantry что уже есть дома: productId → граммы
 */
export function planWaves(
  schedule: MenuSchedule,
  waveDays: number = DEFAULT_WAVE_DAYS,
  pantry: Record<string, number> = {},
  products: Record<string, Product> = PRODUCT_BY_ID,
): ShoppingWave[] {
  const totalDays = schedule.days.length;
  if (totalDays === 0) return [];

  const waveCount = Math.max(1, Math.ceil(totalDays / waveDays));

  // Потребность в продуктах по каждой волне — строго из расписания.
  const needByWave: Record<string, number>[] = Array.from(
    { length: waveCount },
    () => ({}),
  );
  for (const day of schedule.days) {
    const w = Math.min(waveCount - 1, Math.floor(day.index / waveDays));
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        for (const ing of dish.recipe.ingredients) {
          needByWave[w][ing.productId] =
            (needByWave[w][ing.productId] ?? 0) + ing.grams * dish.portions;
        }
      }
    }
  }

  // Остатки, переходящие между волнами: купили пачку риса на 1 кг,
  // израсходовали 300 г — во вторую волну рис покупать не надо.
  const carried: Record<string, number> = { ...pantry };
  const waves: ShoppingWave[] = [];

  // Оценка полной стоимости плана — нужна, чтобы понять, какая доля
  // приходится на один поход. Считаем грубо, по нетто: точность здесь
  // не важна, важен порядок величины.
  let totalPlanCost = 0;
  for (const waveNeed of needByWave) {
    for (const [productId, grams] of Object.entries(waveNeed)) {
      const product = products[productId];
      if (product) totalPlanCost += (grossFromNet(product, grams) / 1000) * product.pricePerKg;
    }
  }

  for (let w = 0; w < waveCount; w++) {
    const dayIndex = w * waveDays;
    const coversDays = Math.min(waveDays, totalDays - dayIndex);
    const lines: WaveLine[] = [];
    // сколько уже набрано в этот поход — для контроля нагрузки
    let runningCost = 0;

    for (const [productId, rawNeed] of Object.entries(needByWave[w])) {
      const product = products[productId];
      if (!product) continue;

      // сначала расходуем то, что осталось с прошлой волны
      const have = carried[productId] ?? 0;
      const need = Math.max(0, rawNeed - have);
      carried[productId] = Math.max(0, have - rawNeed);
      if (need <= 0) continue;

      // ── НА СКОЛЬКО ВПЕРЁД ЗАКУПАТЬ ──
      //
      // Нескоропортящееся выгодно взять сразу: крупа в пачке 900 г
      // всё равно не влезет в недельную потребность 200 г, и дробить
      // закупку — значит купить четыре пачки вместо одной.
      //
      // Но «сразу на месяц» упирается в физику: первая волна выходила
      // 8090 ₽ и включала 7 кг картофеля — это ведро, которое человек
      // не донесёт и не сможет хранить. Поэтому запас вперёд ограничен
      // и сроком хранения, и разумной массой одной покупки.
      // Запас вперёд — не больше одной дополнительной волны.
      //
      // Раньше непортящееся бралось сразу на весь остаток периода,
      // и первый поход в магазин выходил 7842 ₽ и 50 позиций — больше
      // половины месячного чека за один раз. Это не список покупок,
      // а переезд. Человеку важнее ровная нагрузка, чем экономия
      // нескольких процентов на крупной фасовке.
      const daysLeft = totalDays - dayIndex;
      const horizonDays = Math.min(daysLeft, product.shelfLifeDays);
      let wavesAhead = product.perishable || horizonDays < waveDays * 2 ? 0 : 1;

      // РАВНОМЕРНАЯ НАГРУЗКА НА ПЕРВЫЙ ПОХОД.
      //
      // Отзыв: «первый поход 6 819 ₽ и 56 позиций против 1-2 тысяч
      // в остальные. Я это физически не унесу». Ограничение запаса
      // одной волной не помогло: в первый заход всё равно валится
      // всё непортящееся сразу — крупы, масла, специи, консервы.
      //
      // Если поход уже набрал больше своей доли бюджета, перестаём
      // брать впрок: пусть эти позиции купятся в следующий раз.
      // Экономия на крупной фасовке не стоит тележки с горкой.
      if (w === 0 && waveCount > 1) {
        const fairShare = (totalPlanCost / waveCount) * 1.6;
        if (runningCost > fairShare) wavesAhead = 0;
      }

      let target = need;
      for (let k = w + 1; k <= w + wavesAhead && k < waveCount; k++) {
        target += needByWave[k][productId] ?? 0;
      }

      // ДОРОГОЕ НЕ БЕРЁМ ВПРОК В ПЕРВЫЙ ЖЕ ПОХОД.
      //
      // Отзыв: «первый поход 6 819 ₽, я это не унесу». Разбор показал
      // главную причину: под 130 г креветок покупалась пачка на кило
      // за 1250 ₽, под 15 г пармезана — упаковка за 360 ₽. Дорогие
      // продукты с крупной фасовкой сваливались в первый заход,
      // потому что нужны в первую неделю хотя бы немного.
      //
      // Такие позиции переносим на ту волну, где продукт нужен больше
      // всего: человек купит пачку креветок тогда, когда действительно
      // будет их готовить, а не «немножко на всякий случай».
      const minPackCost =
        (Math.min(...(product.packSizes.length ? product.packSizes : [1000])) / 1000) *
        product.pricePerKg;
      if (minPackCost >= 300 && waveCount > 1) {
        let bestWave = w;
        let bestNeed = needByWave[w][productId] ?? 0;
        for (let k = w + 1; k < waveCount; k++) {
          const n = needByWave[k][productId] ?? 0;
          if (n > bestNeed) {
            bestNeed = n;
            bestWave = k;
          }
        }
        // Если позже продукт нужен заметно больше — покупаем там.
        // Пропускаем позицию сейчас: она появится в своей волне.
        if (bestWave !== w && bestNeed > rawNeed * 1.5) {
          carried[productId] = have;
          continue;
        }
      }

      // Потолок массы одной позиции: больше 4 кг за раз человек
      // не понесёт, даже если формально это выгодно.
      const MAX_SINGLE_BUY_G = 4000;
      if (target > MAX_SINGLE_BUY_G && need <= MAX_SINGLE_BUY_G) {
        target = Math.max(need, MAX_SINGLE_BUY_G);
      }

      const gross = grossFromNet(product, target);
      const pack = packsNeeded(product, gross);
      const boughtNet = pack.totalGrams * (1 - product.wasteRatio);

      // Честно про срок: продукт может не дожить до конца волны.
      // Молоко со сроком 7 дней, купленное на неделю, — на грани.
      const fitsShelfLife = product.shelfLifeDays >= coversDays;

      runningCost += (pack.totalGrams / 1000) * product.pricePerKg;
      lines.push({
        product,
        neededGrams: need,
        buyGrams: pack.totalGrams,
        packs: pack.packs,
        packSize: pack.packSize,
        cost: (pack.totalGrams / 1000) * product.pricePerKg,
        carryOver: Math.max(0, boughtNet - rawNeed + have),
        fitsShelfLife,
        advice: fitsShelfLife
          ? undefined
          : FREEZABLE.has(product.category)
            ? 'freeze'
            : 'buyLater',
      });

      carried[productId] = Math.max(0, boughtNet - need);
    }

    lines.sort((a, b) => b.cost - a.cost);
    waves.push({
      index: w,
      dayIndex,
      coversDays,
      lines,
      cost: lines.reduce((s, l) => s + l.cost, 0),
    });
  }

  return waves;
}

/** Позиции, которые могут испортиться до конца своей волны. */
export function riskyLines(wave: ShoppingWave): WaveLine[] {
  return wave.lines.filter((l) => !l.fitsShelfLife);
}
