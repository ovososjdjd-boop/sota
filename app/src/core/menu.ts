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
  { repeatGap: 2, overfillFactor: 1.8, maxSameRole: 1, maxDishes: 5 },
  // финальный: не оставляем ужин пустым. Повтор через день хуже,
  // чем день вообще без ужина — это вопрос практичности, а не эстетики.
  { repeatGap: 1, overfillFactor: 2.2, maxSameRole: 1, maxDishes: 5 },
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
          const order: Record<string, number> = { lunch: 0, dinner: 1, breakfast: 2, snack: 3 };
          slots.sort((a, b) => {
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
          const byRoom = Math.max(1, Math.floor(roomKcal / perPortionKcal));

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
            meal.minutes += pick.stats.recipe.minutes;
            day.minutes += pick.stats.recipe.minutes;
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
    { minGap: 2, maxSameGroup: 1, maxDishes: 5, fillTo: 1.5, requireCore: true },
    // Финальная стадия: СанПиН допускает отклонение по отдельному приёму,
    // если среднее за период в норме. Пустой приём хуже, чем приём
    // из одного гарнира, поэтому структуру здесь не требуем.
    { minGap: 1, maxSameGroup: 1, maxDishes: 6, fillTo: 2.4, requireCore: false },
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
          if (ratio < stage.fillTo && dayRatio < 1.15) {
            weakMeals.push({ day, meal, ratio });
          }
        }
      }
      weakMeals.sort((a, b) => a.ratio - b.ratio);

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
            if (maxMinutesPerDay && maxMinutesPerDay > 0 && cooked) {
              // Пустой основной приём хуже небольшого превышения лимита.
              // Для завтрака, обеда и ужина допускаем блюда до 15 минут
              // сверх бюджета — это бутерброд или яичница, не готовка.
              const isMain = meal.slot !== 'snack';
              const isEmpty = meal.dishes.length === 0;
              const allowance = isMain && isEmpty ? 15 : 5;
              const quick = recipe.minutes <= allowance;
              if (!quick && day.minutes + recipe.minutes > maxMinutesPerDay) {
                continue;
              }
            }
            const serve = Math.min(entry.portions, eaters);

            meal.dishes.push({ recipe, stats: entry.stats, portions: serve, cooked });
            addTo(meal.nutrients, entry.stats.nutrients, serve);
            addTo(day.nutrients, entry.stats.nutrients, serve);
            if (cooked) {
              meal.minutes += recipe.minutes;
              day.minutes += recipe.minutes;
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
    if (!isDaily && served.some((d) => Math.abs(day.index - d) < relax.repeatGap)) {
      continue;
    }
    // привычка подаётся ровно один раз в день, а не пачкой
    if (isDaily && served.includes(day.index)) continue;

    // две «углеводные основы» в одном приёме — не разнообразие, а ошибка
    const group = ROLE_GROUP[recipe.role] ?? recipe.role;
    const sameGroup = meal.dishes.filter(
      (x) => (ROLE_GROUP[x.recipe.role] ?? x.recipe.role) === group,
    ).length;
    if (sameGroup >= relax.maxSameRole) continue;

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
    if (maxMinutesPerDay && maxMinutesPerDay > 0) {
      const willCook = !wasCookedRecently(schedule, recipe, day.index);
      if (willCook && day.minutes + recipe.minutes > maxMinutesPerDay) {
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

    // batch cooking: доесть готовое приятнее, чем варить заново
    if (wasCookedRecently(schedule, recipe, day.index)) score += 0.2;

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
