/**
 * Планировщик меню: фаза 2 по декомпозиции Balintfy (1978).
 *
 * Фаза 1 (частоты подачи) — оптимизатор: сколько порций каждого блюда нужно.
 * Фаза 2 (расписание) — этот модуль: раскладка порций по дням и приёмам.
 *
 * Почему не MILP: размерность мала (7-30 дней × 4 слота), зато жёстких
 * правил много и они плохо линеаризуются («не повторять 2-3 дня подряд»,
 * «суп только на обед», batch cooking). Жадное размещение с двумя проходами
 * даёт качественный результат за миллисекунды и остаётся предсказуемым.
 *
 * Двухпроходная схема появилась после провала однопроходной: при жёстких
 * правилах 20 из 47 блюд не находили места, а дни недобирали 40% калорий.
 * Теперь первый проход соблюдает все правила, второй — размещает остаток,
 * последовательно ослабляя мягкие ограничения.
 */

import type { Nutrients } from './types';
import { PRODUCT_BY_ID } from '../data/products';
import {
  MEAL_ENERGY_SHARE,
  MEAL_SHARE_TOLERANCE,
  type DishRole,
  type MealSlot,
  type Recipe,
  type RecipeStats,
} from './recipes';

/** Минимальный промежуток между повторами блюда, дней.
 *  Источник: СанПиН 2.4.5.2409-08 — «не допускается повторение одних и тех же
 *  блюд в один и тот же день или в последующие 2-3 дня». */
export const MIN_REPEAT_GAP_DAYS = 3;

export interface PlannedDish {
  recipe: Recipe;
  stats: RecipeStats;
  /** Сколько порций съедается в этот приём (на всю семью) */
  portions: number;
  /** Приготовлено в этот день или разогревается из ранее сваренного */
  cooked: boolean;
}

export interface PlannedMeal {
  slot: MealSlot;
  dishes: PlannedDish[];
  nutrients: Nutrients;
  /** Целевая калорийность приёма (на всю семью) */
  targetKcal: number;
  /** Время готовки в этот приём, мин */
  minutes: number;
}

export interface PlannedDay {
  index: number;
  meals: PlannedMeal[];
  nutrients: Nutrients;
  targetKcal: number;
  minutes: number;
}

export interface MenuSchedule {
  days: PlannedDay[];
  unplaced: { recipe: Recipe; portions: number }[];
  notes: string[];
}

export interface DishDemand {
  stats: RecipeStats;
  /** Всего порций за период на всю семью */
  portions: number;
  /** Блюдо-привычка: подаётся каждый день, правило неповторения не действует */
  daily?: boolean;
}

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Насколько мягкие правила ослаблены на данном проходе. */
interface Relaxation {
  /** Разрешённый минимум дней между повторами */
  repeatGap: number;
  /** Во сколько раз можно превысить целевую калорийность приёма */
  overfillFactor: number;
  /** Максимум блюд одной роли в приёме */
  maxSameRole: number;
  /** Максимум блюд в приёме */
  maxDishes: number;
}

const PASSES: Relaxation[] = [
  // строгий проход: все правила соблюдены
  { repeatGap: MIN_REPEAT_GAP_DAYS, overfillFactor: 1.15, maxSameRole: 1, maxDishes: 3 },
  // умеренный: разрешаем плотнее набивать приёмы
  { repeatGap: MIN_REPEAT_GAP_DAYS, overfillFactor: 1.4, maxSameRole: 1, maxDishes: 4 },
  // мягкий: повтор через 2 дня — на коротком периоде иначе не хватает блюд
  { repeatGap: 2, overfillFactor: 1.6, maxSameRole: 1, maxDishes: 5 },
  // финальный: не оставляем ужин пустым. Повтор через день хуже,
  // чем день вообще без ужина — это вопрос практичности, а не эстетики.
  // overfillFactor 1.8, а не 2.2: приём, раздутый вдвое, — это уже
  // не «немного больше», а перекос. Вместе с потолком дня в уборщике
  // это убирает дни на 3000+ ккал при цели 2500.
  { repeatGap: 1, overfillFactor: 1.8, maxSameRole: 1, maxDishes: 5 },
];

function zero(): Nutrients {
  return { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
}

function addTo(target: Nutrients, add: Nutrients, times: number) {
  target.kcal += add.kcal * times;
  target.protein += add.protein * times;
  target.fat += add.fat * times;
  target.carbs += add.carbs * times;
  target.fiber = (target.fiber ?? 0) + (add.fiber ?? 0) * times;
}

/**
 * Раскладка блюд по дням и приёмам пищи.
 *
 * @param demands   что и сколько нужно съесть за период
 * @param days      длина периода
 * @param eaters    число едоков
 * @param dailyKcal целевая калорийность на всю семью в день
 */
export function buildSchedule(
  demands: DishDemand[],
  days: number,
  eaters: number,
  dailyKcal: number,
  /** Максимум времени готовки в день, мин. Фаза 1 задаёт средний бюджет
   *  времени, но раскладка может собрать все трудоёмкие блюда в один день —
   *  поэтому лимит нужен и здесь. */
  maxMinutesPerDay?: number,
): MenuSchedule {
  const notes: string[] = [];

  const schedule: PlannedDay[] = Array.from({ length: days }, (_, index) => ({
    index,
    meals: SLOT_ORDER.map((slot) => ({
      slot,
      dishes: [] as PlannedDish[],
      nutrients: zero(),
      targetKcal: dailyKcal * MEAL_ENERGY_SHARE[slot],
      minutes: 0,
    })),
    nutrients: zero(),
    targetKcal: dailyKcal,
    minutes: 0,
  }));

  /** Дни, в которые подавалось блюдо */
  const servedDays = new Map<string, number[]>();

  /** Остаток порций к размещению */
  const remaining = new Map<
    string,
    { stats: RecipeStats; portions: number; daily?: boolean }
  >();
  for (const d of demands) {
    remaining.set(d.stats.recipe.id, {
      stats: d.stats,
      portions: Math.round(d.portions),
      daily: d.daily,
    });
  }

  // Обход ПО СЛОТАМ, а не по блюдам.
  //
  // Раньше блюда размещались по очереди, и первые «съедали» лучшие места:
  // борщ занимал все обеды, где мог, а на остальные дни обеда не оставалось.
  // Итог — 5 приёмов пищи вообще без еды.
  //
  // Теперь для каждого приёма подбирается лучшее из доступных блюд.
  // Это гарантирует, что сначала заполняются ВСЕ обеды, и только потом
  // добавляются дополнения.
  for (const relax of PASSES) {
    // порядок заполнения: сначала ядро каждого приёма во все дни,
    // затем дополнения
    // Порядок слотов внутри стадии «ядро» важен: обед и ужин конкурируют
    // за одни и те же блюда (макароны по-флотски годятся и туда, и туда).
    // Раньше обеды разбирали всё и ужины оставались пустыми.
    // Теперь ядро раскладывается по слотам: сначала все ужины, потом обеды,
    // потом завтраки — от самого дефицитного набора блюд к самому широкому.
    for (const stage of ['core', 'extra'] as const) {
      let progress = true;
      let guard = 0;

      while (progress && guard++ < 2000) {
        progress = false;

        const slots: { day: PlannedDay; meal: PlannedMeal; deficit: number }[] = [];
        for (const day of schedule) {
          for (const meal of day.meals) {
            const deficit = meal.targetKcal - meal.nutrients.kcal;
            if (deficit > meal.targetKcal * 0.12) {
              slots.push({ day, meal, deficit });
            }
          }
        }

        if (stage === 'core') {
          // Обед и ужин конкурируют за одни блюда. Раньше ужины шли
          // первыми и забирали все основы — обеды оставались с гарнирами.
          // Теперь идём по дням, чередуя обед и ужин: оба приёма
          // получают основу в один день, прежде чем перейти к следующему.
          //
          // Но обход строго слева направо давал перекос: первые дни
          // набивались под завязку (121% нормы, 186 минут готовки),
          // а хвост периода голодал (52%). Разброс по дням был
          // от 52% до 113% при том, что еды в сумме хватало.
          //
          // Поэтому первичный ключ — не номер дня, а НАПОЛНЕННОСТЬ дня:
          // очередь всегда получает самый отстающий день. Номер дня
          // остаётся вторичным ключом, чтобы при равенстве порядок
          // был предсказуемым, а не случайным.
          const order: Record<string, number> = { lunch: 0, dinner: 1, breakfast: 2, snack: 3 };
          slots.sort((a, b) => {
            const fillA = a.day.nutrients.kcal / Math.max(1, a.day.targetKcal);
            const fillB = b.day.nutrients.kcal / Math.max(1, b.day.targetKcal);
            // группируем по «ступеням» наполненности в 10%, иначе
            // раскладка мечется между днями и рвёт batch cooking
            const stepA = Math.floor(fillA * 10);
            const stepB = Math.floor(fillB * 10);
            if (stepA !== stepB) return stepA - stepB;
            if (a.day.index !== b.day.index) return a.day.index - b.day.index;
            return (order[a.meal.slot] ?? 9) - (order[b.meal.slot] ?? 9);
          });
        } else {
          // Дополнения — по относительному дефициту: самый «голодный»
          // приём получает еду первым.
          slots.sort(
            (a, b) =>
              b.deficit / Math.max(1, b.meal.targetKcal) -
              a.deficit / Math.max(1, a.meal.targetKcal),
          );
        }

        for (const { day, meal } of slots) {
          const isCoreStage = stage === 'core';
          const needsCore = mealNeedsCore(meal);
          if (isCoreStage && !needsCore) continue;

          const pick = pickDishForMeal(
            schedule,
            day,
            meal,
            remaining,
            servedDays,
            eaters,
            relax,
            isCoreStage,
            maxMinutesPerDay,
          );
          if (!pick) continue;

          const entry = remaining.get(pick.stats.recipe.id)!;

          // Сколько порций подать в этот приём. Раньше подавалось жёстко
          // по числу едоков, из-за чего у семьи из 4 блюда «сгорали»
          // за один приём и на остальные дни не оставалось.
          // Теперь ограничиваем ещё и вместимостью приёма по калориям.
          // Раньше подача жёстко ограничивалась числом едоков, и на 30 дней
          // для семьи из 4 не размещалось 153 порции из 941.
          // Правильный предел — вместимость приёма по калориям: если блюдо
          // лёгкое, семья съедает и по две порции на человека.
          const perPortionKcal = Math.max(1, pick.stats.nutrients.kcal);
          const roomKcal =
            meal.targetKcal * relax.overfillFactor - meal.nutrients.kcal;
          // Вместимость ДНЯ, а не только приёма.
          //
          // Отзыв: «дни скачут от 1583 до 3090 ккал при цели 2506».
          // Причина: подача ограничивалась вместимостью приёма, а день
          // целиком никто не проверял. Четыре щедрых приёма подряд —
          // и день уходит на треть выше нормы, а еды на завтра не остаётся.
          const dayRoom =
            day.targetKcal * relax.overfillFactor - day.nutrients.kcal;
          const byDay = Math.max(1, Math.floor(dayRoom / perPortionKcal));
          const byRoom = Math.max(
            1,
            Math.min(Math.floor(roomKcal / perPortionKcal), byDay),
          );

          // Блюдо-привычка съедается по одной порции на человека в день.
          // Без этого 30 порций кофе укладывались в 11 дней пачками.
          const entryIsDaily = remaining.get(pick.stats.recipe.id)?.daily === true;
          if (entryIsDaily) {
            const serveDaily = Math.min(entry.portions, eaters);
            const cookedD = true;
            meal.dishes.push({
              recipe: pick.stats.recipe,
              stats: pick.stats,
              portions: serveDaily,
              cooked: cookedD,
            });
            addTo(meal.nutrients, pick.stats.nutrients, serveDaily);
            addTo(day.nutrients, pick.stats.nutrients, serveDaily);
            meal.minutes += pick.stats.recipe.minutes;
            day.minutes += pick.stats.recipe.minutes;
            const listD = servedDays.get(pick.stats.recipe.id) ?? [];
            listD.push(day.index);
            servedDays.set(pick.stats.recipe.id, listD);
            entry.portions -= serveDaily;
            if (entry.portions <= 0) remaining.delete(pick.stats.recipe.id);
            progress = true;
            continue;
          }
          // Равномерность: не вываливаем весь запас блюда в один приём.
          // Делим остаток на число подач, которые ещё можно сделать
          // с соблюдением правила неповторения.
          const daysLeft = Math.max(1, schedule.length - day.index);
          const servingsLeft = Math.max(1, Math.ceil(daysLeft / relax.repeatGap));
          const evenShare = Math.max(eaters, Math.ceil(entry.portions / servingsLeft));
          // Верхняя граница — вместимость приёма по калориям. Число едоков
          // не ограничивает: семья из 4 съедает 4 порции супа за раз,
          // и это по-прежнему ОДНО блюдо в меню.
          const serve = Math.max(1, Math.min(entry.portions, byRoom, evenShare));
          const cooked = !wasCookedRecently(schedule, pick.stats.recipe, day.index);

          meal.dishes.push({
            recipe: pick.stats.recipe,
            stats: pick.stats,
            portions: serve,
            cooked,
          });
          addTo(meal.nutrients, pick.stats.nutrients, serve);
          addTo(day.nutrients, pick.stats.nutrients, serve);
          if (cooked) {
            // Время пишем на тот день, когда плита реально занята.
            // При готовке впрок это может быть более ранний день —
            // иначе дневной лимит считался бы дважды за одну кастрюлю.
            const cookDay =
              findCookDay(schedule, pick.stats.recipe, day.index, maxMinutesPerDay) ??
              day.index;
            schedule[cookDay].minutes += pick.stats.recipe.minutes;
            if (cookDay === day.index) meal.minutes += pick.stats.recipe.minutes;
          }

          const list = servedDays.get(pick.stats.recipe.id) ?? [];
          list.push(day.index);
          servedDays.set(pick.stats.recipe.id, list);

          entry.portions -= serve;
          if (entry.portions <= 0) remaining.delete(pick.stats.recipe.id);
          progress = true;
        }
      }
    }
  }

  // Финальный проход: остатки распределяем по самым «голодным» дням.
  // Здесь уже не заботимся о равномерности подачи — её обеспечили
  // предыдущие проходы. Задача одна: чтобы еда не пропала.
  sweepRemainder(schedule, remaining, servedDays, eaters, maxMinutesPerDay);

  const unplaced = [...remaining.values()]
    .filter((x) => x.portions > 0)
    .map((x) => ({ recipe: x.stats.recipe, portions: x.portions }));

  if (unplaced.length > 0) {
    const total = unplaced.reduce((s, x) => s + x.portions, 0);
    notes.push(`${total} порций не поместились в расписание — уйдут в запас.`);
  }

  return { days: schedule, unplaced, notes };
}

/**
 * Доразмещение остатков. Работает по самым недобирающим дням
 * и допускает повтор через день — лучше повторить блюдо,
 * чем оставить продукты неиспользованными.
 */
function sweepRemainder(
  schedule: PlannedDay[],
  remaining: Map<string, { stats: RecipeStats; portions: number; daily?: boolean }>,
  servedDays: Map<string, number[]>,
  eaters: number,
  maxMinutesPerDay?: number,
): void {
  // Ступенчатое смягчение: сначала пытаемся соблюсти интервал в 2 дня
  // и запрет на три углеводные основы, и только если остатки не расходятся —
  // разрешаем повтор через день. Это компромисс между «красивым меню»
  // и «продукты не должны пропасть».
  const stages = [
    { minGap: 2, maxSameGroup: 1, maxDishes: 5, fillTo: 1.35, requireCore: true, dayCap: 1.08 },
    // Финальная стадия: СанПиН допускает отклонение по отдельному приёму,
    // если среднее за период в норме. Пустой приём хуже, чем приём
    // из одного гарнира, поэтому структуру здесь не требуем.
    // fillTo 1.6, а не 2.4, и потолок дня 1.12.
    //
    // Отзыв: «то 1583 ккал, то 3090 при цели 2506». Финальная стадия
    // уборщика разрешала приёму раздуться в 2.4 раза, а дню — уйти
    // на 15% выше нормы. Совпадение двух допусков и давало дни
    // на 3000+ ккал. Уборщик существует, чтобы не пропала еда,
    // а не чтобы перекормить в один день.
    { minGap: 1, maxSameGroup: 1, maxDishes: 6, fillTo: 1.6, requireCore: false, dayCap: 1.12 },
  ];

  for (const stage of stages) {
    let guard = 0;
    let progress = true;

    while (progress && guard++ < 3000) {
      progress = false;
      // Идём по САМЫМ СЛАБЫМ ПРИЁМАМ, а не по дням: раньше уборщик
      // прекращал работу, когда день в целом набрал норму, и отдельный
      // приём мог остаться на 40% от целевой калорийности.
      const weakMeals: { day: PlannedDay; meal: PlannedMeal; ratio: number }[] = [];
      for (const day of schedule) {
        for (const meal of day.meals) {
          const ratio = meal.nutrients.kcal / Math.max(1, meal.targetKcal);
          // добираем приём, пока он не превысил лимит стадии И день
          // не ушёл далеко за свою норму
          const dayRatio = day.nutrients.kcal / Math.max(1, day.targetKcal);
          if (ratio < stage.fillTo && dayRatio < stage.dayCap) {
            weakMeals.push({ day, meal, ratio });
          }
        }
      }
      // Сначала САМЫЕ ГОЛОДНЫЕ ДНИ, и только потом слабые приёмы внутри.
      //
      // Отзыв: «дни скачут: то 1583 ккал, то 3090 при цели 2506.
      // В сумме за месяц сходится, но я живу днём, а не месяцем».
      // Причина была здесь: уборщик сортировал приёмы по их
      // собственной наполненности, не глядя на день целиком. Приём
      // на 40% в сытом дне добирался раньше, чем такой же приём
      // в голодном, и разрыв между днями только рос.
      weakMeals.sort((a, b) => {
        const dayA = a.day.nutrients.kcal / Math.max(1, a.day.targetKcal);
        const dayB = b.day.nutrients.kcal / Math.max(1, b.day.targetKcal);
        // ступени по 10%, иначе раскладка мечется между днями
        const stepA = Math.floor(dayA * 10);
        const stepB = Math.floor(dayB * 10);
        if (stepA !== stepB) return stepA - stepB;
        return a.ratio - b.ratio;
      });

      {
        for (const { day, meal } of weakMeals) {
          if (meal.nutrients.kcal > meal.targetKcal * stage.fillTo) continue;
          if (meal.dishes.length >= stage.maxDishes) continue;

          for (const entry of remaining.values()) {
            if (entry.portions <= 0) continue;
            const { recipe } = entry.stats;
            if (!recipe.slots.includes(meal.slot)) continue;
            if (meal.dishes.some((x) => x.recipe.id === recipe.id)) continue;

            const served = servedDays.get(recipe.id) ?? [];
            if (served.some((d) => Math.abs(day.index - d) < stage.minGap)) continue;

            const group = ROLE_GROUP[recipe.role] ?? recipe.role;
            const sameGroup = meal.dishes.filter(
              (x) => (ROLE_GROUP[x.recipe.role] ?? x.recipe.role) === group,
            ).length;
            if (sameGroup >= stage.maxSameGroup) continue;

            // Структура приёма: гарнир не делает обед обедом. Но если приём
            // пуст, а основы кончились, дополнение лучше пустоты —
            // поэтому правило действует только пока приём непустой.
            const coreRoles = CORE_ROLES[meal.slot] ?? [];
            if (stage.requireCore && coreRoles.length > 0 && meal.dishes.length > 0) {
              const hasCore = meal.dishes.some((x) => coreRoles.includes(x.recipe.role));
              if (!hasCore && !coreRoles.includes(recipe.role)) continue;
            }


            const cooked = !wasCookedRecently(schedule, recipe, day.index);
            // Уборщик не должен превращать день в 4 часа у плиты.
            // Но если день упёрся в лимит, разогретое и готовое к еде
            // (фрукты, кефир, бутерброды) добавлять можно — иначе
            // приём останется пустым.
            let cookDayIndex = day.index;
            if (maxMinutesPerDay && maxMinutesPerDay > 0 && cooked) {
              // Пустой основной приём хуже небольшого превышения лимита.
              // Для завтрака, обеда и ужина допускаем блюда до 15 минут
              // сверх бюджета — это бутерброд или яичница, не готовка.
              const isMain = meal.slot !== 'snack';
              const isEmpty = meal.dishes.length === 0;
              const allowance = isMain && isEmpty ? 15 : 5;
              const quick = recipe.minutes <= allowance;
              const found = findCookDay(schedule, recipe, day.index, maxMinutesPerDay);
              if (found !== null) {
                cookDayIndex = found;
              } else if (!quick) {
                continue;
              }
            }
            const serve = Math.min(entry.portions, eaters);

            meal.dishes.push({ recipe, stats: entry.stats, portions: serve, cooked });
            addTo(meal.nutrients, entry.stats.nutrients, serve);
            addTo(day.nutrients, entry.stats.nutrients, serve);
            if (cooked) {
              schedule[cookDayIndex].minutes += recipe.minutes;
              if (cookDayIndex === day.index) meal.minutes += recipe.minutes;
            }

            served.push(day.index);
            servedDays.set(recipe.id, served);
            entry.portions -= serve;
            if (entry.portions <= 0) remaining.delete(recipe.id);
            progress = true;
            break;
          }
        }
      }
    }
  }
}

/**
 * На какой день записать готовку блюда, подаваемого в день dayIndex.
 *
 * Люди готовят впрок: кастрюля борща варится один раз и кормит три дня.
 * Раньше время списывалось целиком на день подачи, и при лимите
 * «60 минут» раскладка теряла 20% еды — почти всё горячее не влезало
 * в дневной бюджет времени, хотя по сумме за период времени хватало.
 *
 * Возвращает индекс дня, на который относится время готовки:
 * сегодня, если бюджет позволяет, иначе ближайший день в пределах
 * срока хранения, где время есть. null — приготовить негде.
 */
function findCookDay(
  schedule: PlannedDay[],
  recipe: Recipe,
  dayIndex: number,
  maxMinutesPerDay?: number,
): number | null {
  if (!maxMinutesPerDay || maxMinutesPerDay <= 0) return dayIndex;
  if (schedule[dayIndex].minutes + recipe.minutes <= maxMinutesPerDay) return dayIndex;

  // готовить впрок можно только то, что хранится и варится партией
  if (recipe.keepsDays <= 0 || recipe.batchPortions <= 1) return null;

  const earliest = Math.max(0, dayIndex - recipe.keepsDays);
  let best: number | null = null;
  let bestLoad = Infinity;
  for (let d = dayIndex - 1; d >= earliest; d--) {
    const load = schedule[d].minutes;
    if (load + recipe.minutes <= maxMinutesPerDay && load < bestLoad) {
      best = d;
      bestLoad = load;
    }
  }
  return best;
}

/** Готовилось ли блюдо недавно — тогда сегодня только разогреваем. */
function wasCookedRecently(
  schedule: PlannedDay[],
  recipe: Recipe,
  dayIndex: number,
): boolean {
  const from = Math.max(0, dayIndex - recipe.keepsDays);
  for (let d = from; d < dayIndex; d++) {
    for (const meal of schedule[d].meals) {
      if (meal.dishes.some((x) => x.recipe.id === recipe.id && x.cooked)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Взаимозаменяемые роли: два «углеводных основания» в одном приёме — это
 * не разнообразие, а ошибка. Реальный прогон давал ужин из макарон,
 * кукурузной каши и ячневой каши одновременно.
 */
export const ROLE_GROUP_MAP: Record<string, string> = {
  porridge: 'base',
  side: 'base',
  soup: 'soup',
  main: 'main',
  salad: 'salad',
  snack: 'snack',
  drink: 'drink',
  bakery: 'bakery',
};

/**
 * ВМЕСТИМОСТЬ РАСПИСАНИЯ — сколько подач группы блюд физически можно
 * разложить за период.
 *
 * Зачем это здесь. Найден дефект, который дороже всех остальных:
 * фаза 1 заказывала еду, не зная правил раскладки, и 17-29% порций
 * не находили места. При этом продукты на них ПОКУПАЛИСЬ и попадали
 * в список покупок и в КБЖУ. Человек платил за еду, которой нет
 * в его меню, и видел «2500 ккал в день», хотя на тарелке было 1780.
 *
 * Пример из прогона (месяц, 1 человек): заказано 68 порций напитков,
 * а мест ровно 60 — напиток уместен только в перекус и завтрак,
 * и в один приём их не ставят по два. Восемь порций кефира куплены
 * и выброшены ещё на этапе планирования.
 *
 * Правило раскладки простое: в один приём попадает не больше одного
 * блюда каждой ролевой группы. Значит мест = дни × число приёмов,
 * куда группа вообще допускается, × число едоков.
 *
 * Эта функция — единственный источник правды о вместимости.
 * Фаза 1 берёт из неё верхние границы, фаза 2 живёт по тем же правилам.
 */
export function groupCapacity(
  slots: readonly string[],
  days: number,
  eaters: number,
): number {
  const usableSlots = new Set(slots).size;
  return days * usableSlots * eaters;
}

const ROLE_GROUP: Record<string, string> = {
  // «base» — углеводная основа тарелки. Две таких в одном приёме
  // («каша + макароны») — ошибка меню, а не разнообразие.
  porridge: 'base',
  side: 'base',
  soup: 'soup',
  main: 'main',
  salad: 'salad',
  snack: 'snack',
  drink: 'drink',
  bakery: 'bakery',
};

/**
 * Главное крахмалистое основание блюда: макароны, рис, гречка, картофель.
 *
 * Нужно, чтобы не подать в один приём «макароны с фаршем» и «макароны
 * с маслом». Роли у них разные (основное и гарнир), правило по ролям
 * такое сочетание пропускает, а на тарелке выходят макароны с макаронами.
 *
 * Считаем по самому массивному ингредиенту из круп, макарон и картофеля;
 * мелкие добавки (ложка риса в суп) основанием не считаются.
 */
function dominantStaple(stats: RecipeStats): string | null {
  let best: string | null = null;
  let bestGrams = 0;
  for (const ing of stats.recipe.ingredients) {
    const product = PRODUCT_BY_ID[ing.productId];
    if (!product) continue;
    const isStaple =
      product.category === 'grain' ||
      (product.category === 'vegetable' && product.id === 'potato');
    if (!isStaple) continue;
    if (ing.grams > bestGrams) {
      bestGrams = ing.grams;
      best = ing.productId;
    }
  }
  // меньше 40 г — это добавка, а не основа тарелки
  return bestGrams >= 40 ? best : null;
}

/** Нужна ли приёму «основа» — суп, основное блюдо или каша. */
function mealNeedsCore(meal: PlannedMeal): boolean {
  const roles = CORE_ROLES[meal.slot];
  if (!roles) return false;
  return !meal.dishes.some((d) => roles.includes(d.recipe.role));
}

/** Роли, которые могут быть основой приёма. */
const CORE_ROLES: Partial<Record<MealSlot, DishRole[]>> = {
  breakfast: ['porridge', 'main', 'bakery'],
  lunch: ['soup', 'main'],
  dinner: ['main', 'porridge'],
};

/**
 * Подбор лучшего блюда для конкретного приёма пищи.
 * Обратная задача к прежней: раньше искали слот для блюда,
 * теперь ищем блюдо для слота — это и устранило пустые приёмы.
 */
function pickDishForMeal(
  schedule: PlannedDay[],
  day: PlannedDay,
  meal: PlannedMeal,
  remaining: Map<string, { stats: RecipeStats; portions: number; daily?: boolean }>,
  servedDays: Map<string, number[]>,
  eaters: number,
  relax: Relaxation,
  coreOnly: boolean,
  maxMinutesPerDay?: number,
): { stats: RecipeStats } | null {
  let best: { stats: RecipeStats; score: number } | null = null;
  const coreRoles = CORE_ROLES[meal.slot] ?? [];

  for (const entry of remaining.values()) {
    if (entry.portions <= 0) continue;
    const { recipe } = entry.stats;

    if (!recipe.slots.includes(meal.slot)) continue;
    if (coreOnly && !coreRoles.includes(recipe.role)) continue;
    if (meal.dishes.length >= relax.maxDishes) continue;
    if (meal.dishes.some((x) => x.recipe.id === recipe.id)) continue;

    // Правило неповторения (СанПиН). Не действует для блюд-привычек:
    // если человек сказал «кофе каждое утро», это его осознанный выбор.
    const served = servedDays.get(recipe.id) ?? [];
    const isDaily = entry.daily === true;
    // привычка подаётся ровно один раз в день, а не пачкой
    if (isDaily && served.includes(day.index)) continue;

    if (!isDaily) {
      // ДОЕДАНИЕ ПРИГОТОВЛЕННОГО — исключение из правила неповторения.
      //
      // Найденный дефект: 92% блюд готовились заново, хотя batchPortions
      // у них 3-4 порции. Причина — конфликт двух правил. Неповторение
      // запрещает подавать блюдо чаще раза в 3-5 дней, а хранится готовое
      // 2-3 дня. Окна, в котором можно доесть вчерашнее, просто не было:
      // кастрюля супа «протухала» в модели раньше, чем разрешалось
      // подать суп снова. Итог — 145 минут готовки в день и обвал
      // калорийности при любом лимите времени.
      //
      // СанПиН говорит о повторении ОДНИХ И ТЕХ ЖЕ БЛЮД в меню, то есть
      // о новых готовках. Доесть вчерашний борщ — это та же готовка,
      // растянутая на два дня, ровно так и питаются дома. Поэтому
      // разрешаем подачу подряд, пока блюдо не испортилось и осталось
      // в кастрюле, — но только соседними днями, без «размазывания»
      // одного блюда на весь период.
      const canFinishLeftovers =
        recipe.keepsDays > 0 && wasCookedRecently(schedule, recipe, day.index);
      if (!canFinishLeftovers && served.some((d) => Math.abs(day.index - d) < relax.repeatGap)) {
        continue;
      }
    }

    // две «углеводные основы» в одном приёме — не разнообразие, а ошибка
    const group = ROLE_GROUP[recipe.role] ?? recipe.role;
    const sameGroup = meal.dishes.filter(
      (x) => (ROLE_GROUP[x.recipe.role] ?? x.recipe.role) === group,
    ).length;
    if (sameGroup >= relax.maxSameRole) continue;

    // ОДИН И ТОТ ЖЕ ГАРНИР ДВАЖДЫ В ПРИЁМЕ.
    //
    // Найдено глазами на отрисованном меню: обед из «Макароны с фаршем
    // и томатом» плюс «Макароны с маслом». Формально нарушения нет —
    // роли разные (основное и гарнир), группы тоже. Но на тарелке
    // это макароны с макаронами.
    //
    // Проверка по ролям здесь бессильна, нужна проверка по СОСТАВУ:
    // у блюд не должно совпадать основное крахмалистое основание.
    const base = dominantStaple(entry.stats);
    if (
      base &&
      meal.dishes.some((x) => dominantStaple(x.stats) === base)
    ) {
      continue;
    }

    // Завтрак и ужин компактнее обеда: каша/основное + дополнение.
    if ((meal.slot === 'breakfast' || meal.slot === 'dinner') && meal.dishes.length >= 3) {
      continue;
    }

    // структура: дополнения не заменяют основу
    if (!coreOnly && coreRoles.length > 0) {
      const hasCore = meal.dishes.some((x) => coreRoles.includes(x.recipe.role));
      if (!hasCore && !coreRoles.includes(recipe.role)) continue;
    }

    // Не перегружаем день готовкой. Фаза 1 задаёт средний бюджет времени,
    // но раскладка может собрать все трудоёмкие блюда в один день —
    // человек с лимитом «час» получал дни по 4 часа у плиты.
    //
    // Важно: блюдо отбраковывается, только если готовится СЕГОДНЯ.
    // Разогрев готового времени почти не стоит и лимитом не ограничен —
    // иначе кастрюля супа, сваренная вчера, не могла бы попасть
    // в сегодняшний обед, и приём оставался пустым при полном холодильнике.
    if (maxMinutesPerDay && maxMinutesPerDay > 0) {
      const willCook = !wasCookedRecently(schedule, recipe, day.index);
      // Готовка впрок: если сегодня времени нет, блюдо всё равно годится,
      // когда его можно сварить заранее и оно доживёт до подачи.
      if (willCook && findCookDay(schedule, recipe, day.index, maxMinutesPerDay) === null) {
        continue;
      }
    }

    const contribution = entry.stats.nutrients.kcal * eaters;
    const wouldBe = meal.nutrients.kcal + contribution;
    if (wouldBe > meal.targetKcal * relax.overfillFactor) continue;

    const deficit = meal.targetKcal - meal.nutrients.kcal;
    const fitError = Math.abs(deficit - contribution) / Math.max(1, meal.targetKcal);
    let score = 1 - fitError;

    // Блюда-привычки размещаются в первую очередь, но НЕ занимают
    // основной приём: кофе — дополнение к завтраку, а не завтрак.
    // Без этой проверки кофе съедал слот, и день оставался без еды.
    if (entry.daily) {
      const isLight = recipe.role === 'drink' || recipe.role === 'snack';
      const coreRolesHere = CORE_ROLES[meal.slot] ?? [];
      const mealHasCore =
        coreRolesHere.length === 0 ||
        meal.dishes.some((x) => coreRolesHere.includes(x.recipe.role));
      if (isLight && !mealHasCore && meal.slot !== 'snack') continue;

      const first = { stats: entry.stats, score: 100 };
      if (!best || first.score > best.score) best = first;
      continue;
    }

    // Разнообразие — главный критерий после попадания в калорийность.
    // Исследования menu fatigue: приедание к 3-4 неделе — основная причина,
    // по которой человек бросает приложение. Поэтому блюдо, которое ещё
    // не подавалось, получает существенное преимущество, а каждая
    // следующая подача заметно снижает шансы.
    if (served.length > 0) {
      const gap = Math.min(...served.map((d) => Math.abs(day.index - d)));
      score += Math.min(gap / 7, 0.3);
      // штраф растёт с числом уже сделанных подач
      score -= Math.min(served.length * 0.18, 0.9);
    } else {
      score += 0.75;
    }

    // BATCH COOKING. Доесть готовое приятнее, чем варить заново,
    // а при жёстком лимите времени — ещё и единственный способ
    // накормить человека.
    //
    // Бонус был фиксированным (0.2) и проигрывал награде за новое
    // блюдо (0.75). Пока времени вдоволь, это правильно: разнообразие
    // важнее. Но при лимите 60 мин/день бюджет времени исчерпывался
    // на 102%, обед недобирал 25% калорий — раскладка упрямо бралась
    // за новую готовку вместо кастрюли, стоящей в холодильнике.
    //
    // Поэтому вес зависит от того, есть ли ещё время сегодня.
    // Свободен день — разнообразим; время кончилось — доедаем.
    if (wasCookedRecently(schedule, recipe, day.index)) {
      const tight =
        maxMinutesPerDay !== undefined &&
        maxMinutesPerDay > 0 &&
        day.minutes + recipe.minutes > maxMinutesPerDay;
      score += tight ? 1.2 : 0.2;
    }

    // блюда с большим остатком порций — приоритет, чтобы всё разошлось
    score += Math.min(entry.portions / 10, 0.2);

    if (!best || score > best.score) best = { stats: entry.stats, score };
  }

  return best;
}

/** Оценка качества расписания. */
export interface ScheduleQuality {
  maxDayDeviation: number;
  maxSlotDeviation: number;
  hasCloseRepeats: boolean;
  emptyDays: number;
  /** Приёмов пищи без единого блюда */
  emptyMeals: number;
  avgMinutesPerDay: number;
}

export function assessSchedule(schedule: MenuSchedule): ScheduleQuality {
  let maxDayDeviation = 0;
  let maxSlotDeviation = 0;
  let emptyDays = 0;
  let emptyMeals = 0;
  let totalMinutes = 0;
  const seen = new Map<string, number[]>();
  let hasCloseRepeats = false;

  for (const day of schedule.days) {
    if (day.targetKcal > 0) {
      maxDayDeviation = Math.max(
        maxDayDeviation,
        Math.abs(day.nutrients.kcal - day.targetKcal) / day.targetKcal,
      );
    }
    if (day.nutrients.kcal === 0) emptyDays++;
    totalMinutes += day.minutes;

    for (const meal of day.meals) {
      // перекус может быть пустым — это нормально
      if (meal.dishes.length === 0 && meal.slot !== 'snack') emptyMeals++;

      if (day.nutrients.kcal > 0) {
        const share = meal.nutrients.kcal / day.nutrients.kcal;
        maxSlotDeviation = Math.max(
          maxSlotDeviation,
          Math.abs(share - MEAL_ENERGY_SHARE[meal.slot]),
        );
      }
      for (const dish of meal.dishes) {
        const list = seen.get(dish.recipe.id) ?? [];
        if (list.some((d) => d !== day.index && Math.abs(day.index - d) < MIN_REPEAT_GAP_DAYS)) {
          hasCloseRepeats = true;
        }
        list.push(day.index);
        seen.set(dish.recipe.id, list);
      }
    }
  }

  return {
    maxDayDeviation,
    maxSlotDeviation,
    hasCloseRepeats,
    emptyDays,
    emptyMeals,
    avgMinutesPerDay: schedule.days.length ? totalMinutes / schedule.days.length : 0,
  };
}

export { MEAL_SHARE_TOLERANCE };
