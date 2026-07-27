import { useEffect, useMemo, useState } from 'react';
import { Card, Note, Spinner, Button } from '../ui/primitives';
import { cx } from '../ui/cx';
import { moneyPlain, mass } from '../core/format';
import { MODE_LABEL } from '../core/tiers';
import { MEAL_LABEL, ROLE_LABEL, type MealSlot } from '../core/recipes';
import { findAlternatives, type SwapCandidate } from '../core/swap';
import { RecipeSheet } from './RecipeSheet';
import { RECIPES } from '../data/recipes';
import type { PlannedDay, PlannedDish } from '../core/menu';
import type { Store } from '../state/store';

/**
 * Календарь меню: расписание блюд по дням и приёмам пищи.
 *
 * Мобильный приоритет: дни листаются горизонтально, внутри дня —
 * вертикальный список приёмов. Так на экране телефона помещается
 * целый день, а не обрезок таблицы.
 */

const SLOT_ICON: Record<MealSlot, string> = {
  breakfast: '☀',
  lunch: '◐',
  snack: '·',
  dinner: '☾',
};

function DishRow({
  dish,
  eaters,
  onSwap,
}: {
  dish: PlannedDish;
  eaters: number;
  onSwap?: () => void;
}) {
  const perPerson = dish.portions / Math.max(1, eaters);
  const kcal = dish.stats.nutrients.kcal * dish.portions;

  return (
    <button
      onClick={onSwap}
      className="flex w-full items-start gap-2.5 py-2 text-left transition-opacity active:opacity-60">
      <div
        className={cx(
          'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
          dish.cooked ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium leading-snug text-surface-900 dark:text-white">
          {dish.recipe.name}
          {!dish.cooked && (
            <span className="ml-1.5 text-[11px] font-normal text-surface-400">
              разогреть
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-surface-400">
          {ROLE_LABEL[dish.recipe.role]}
          {/*
            Граммовка порции. Отзыв: «в меню не видно граммовки порции —
            только ккал». Показываем массу ГОТОВОГО блюда: именно столько
            окажется в тарелке, с учётом уварки крупы и ужарки мяса.
          */}
          {` · ${mass(dish.stats.cookedGrams)}`}
          {perPerson > 1.2 && ` · ${perPerson.toFixed(perPerson % 1 ? 1 : 0)} порции`}
          {dish.cooked && dish.recipe.minutes > 5 && ` · ${dish.recipe.minutes} мин`}
        </div>
      </div>
      <div className="tnum shrink-0 text-[12px] text-surface-400">
        {Math.round(kcal)}
      </div>
    </button>
  );
}

function DayCard({
  day,
  eaters,
  onSwap,
}: {
  day: PlannedDay;
  eaters: number;
  onSwap: (dish: PlannedDish, slot: MealSlot) => void;
}) {
  const fill = day.targetKcal > 0 ? day.nutrients.kcal / day.targetKcal : 0;
  const tone = Math.abs(fill - 1) < 0.12 ? 'good' : Math.abs(fill - 1) < 0.25 ? 'warn' : 'bad';
  const toneClass = {
    good: 'text-brand-600 dark:text-brand-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-500',
  }[tone];

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-bold text-surface-900 dark:text-white">
          День {day.index + 1}
        </h3>
        <div className="text-right">
          <span className={cx('tnum text-sm font-bold', toneClass)}>
            {Math.round(day.nutrients.kcal)}
          </span>
          <span className="tnum text-xs text-surface-400">
            {' '}
            / {Math.round(day.targetKcal)} ккал
          </span>
        </div>
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${Math.min(fill * 100, 100)}%` }}
        />
      </div>

      <div className="space-y-3">
        {day.meals.map((meal) => (
          <div key={meal.slot}>
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wide text-surface-400">
                <span className="mr-1.5">{SLOT_ICON[meal.slot]}</span>
                {MEAL_LABEL[meal.slot]}
              </div>
              {meal.dishes.length > 0 && (
                <div className="tnum text-[11px] text-surface-300 dark:text-surface-600">
                  {Math.round(meal.nutrients.kcal)} / {Math.round(meal.targetKcal)}
                </div>
              )}
            </div>
            {meal.dishes.length === 0 ? (
              <div className="py-2 text-[13px] text-surface-300 dark:text-surface-700">
                —
              </div>
            ) : (
              <div className="divide-y divide-surface-100 dark:divide-surface-800">
                {meal.dishes.map((dish, i) => (
                  <DishRow
                    key={`${dish.recipe.id}-${i}`}
                    dish={dish}
                    eaters={eaters}
                    onSwap={() => onSwap(dish, meal.slot)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {day.minutes > 0 && (
        <div className="mt-3 border-t border-surface-100 pt-3 text-[12px] text-surface-400 dark:border-surface-800">
          Готовка: около {day.minutes} мин
        </div>
      )}
    </Card>
  );
}

export function MenuScreen({ store }: { store: Store }) {
  const { state, menu, calculatingMenu, recalculateMenu, swapDish } = store;
  const [activeDay, setActiveDay] = useState(0);
  const [swapping, setSwapping] = useState<{
    dish: PlannedDish;
    slot: MealSlot;
  } | null>(null);

  // Альтернативы считаются на лету — база небольшая, задержки нет
  const alternatives = useMemo<SwapCandidate[]>(() => {
    if (!swapping || !menu || menu.status !== 'optimal') return [];
    return findAlternatives({
      schedule: menu.schedule,
      dayIndex: activeDay,
      slot: swapping.slot,
      current: swapping.dish.recipe,
      recipes: RECIPES,
      excluded: new Set(state.excluded),
      dietTags: [...new Set(state.eaters.flatMap((e) => e.dietTags))],
    });
  }, [swapping, menu, activeDay, state.excluded, state.eaters]);

  useEffect(() => {
    if (!menu && !calculatingMenu) void recalculateMenu();
  }, [menu, calculatingMenu, recalculateMenu]);

  const totals = useMemo(() => {
    if (!menu || menu.status !== 'optimal') return null;
    const pd = state.days * state.eaters.length;
    return {
      kcalPerDay: menu.actual.kcal / pd,
      cost: menu.totalCost,
      dishes: menu.demands.length,
    };
  }, [menu, state.days, state.eaters.length]);

  if (calculatingMenu && !menu) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-surface-400">
        <Spinner className="text-brand-500" />
        <p className="text-sm">Составляем меню…</p>
      </div>
    );
  }

  if (!menu) return null;

  if (menu.status !== 'optimal') {
    return (
      <div className="px-5 py-8">
        <Card className="p-6 text-center">
          <div className="mb-3 text-4xl">🍽</div>
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">
            Меню не собирается
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-surface-500 dark:text-surface-400">
            {menu.explanations[0]?.text ?? 'Попробуйте увеличить бюджет.'}
          </p>
          {menu.minimumFeasibleBudget && (
            <Button
              full
              className="mt-5"
              onClick={() => {
                store.update({
                  budget: Math.ceil(menu.minimumFeasibleBudget! / 50) * 50,
                });
                setTimeout(() => void recalculateMenu(), 30);
              }}
            >
              Поставить {moneyPlain(Math.ceil(menu.minimumFeasibleBudget / 50) * 50)} ₽
            </Button>
          )}
        </Card>
      </div>
    );
  }

  const days = menu.schedule.days;

  return (
    <div className="pb-6">
      {/* сводка */}
      <div className="sticky top-0 z-20 border-b border-surface-200/70 bg-surface-50/90 px-5 py-4 backdrop-blur-xl dark:border-surface-800 dark:bg-surface-950/90">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-400">
              Меню на {state.days} дн.
            </div>
            <div className="tnum text-money-sm text-surface-900 dark:text-white">
              {moneyPlain(menu.purchaseCost || totals?.cost || 0)}{' '}
              <span className="text-lg font-semibold text-surface-400">₽</span>
            </div>
            {menu.purchaseCost > menu.totalCost * 1.05 && (
              <div className="text-[11px] text-surface-400">
                еды на {moneyPlain(menu.totalCost)} ₽ + запас
              </div>
            )}
            {/*
              Режим рациона видно сразу: человек должен понимать,
              по какой логике собрано меню, а не гадать, почему
              при большом бюджете появилась рыба, а при малом — нет.
            */}
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
              {MODE_LABEL[menu.mode]} рацион
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-lg font-bold text-brand-600 dark:text-brand-400">
              ≈{Math.round((totals?.kcalPerDay ?? 0) / 10) * 10}
            </div>
            <div className="text-[11px] text-surface-400">ккал/чел в день</div>
          </div>
        </div>

        {/* горизонтальный выбор дня */}
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {days.map((d) => (
            <button
              key={d.index}
              onClick={() => setActiveDay(d.index)}
              className={cx(
                'shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors',
                activeDay === d.index
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400',
              )}
            >
              {d.index + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {menu.explanations.slice(0, 2).map((e, i) => (
          <Note key={i} tone={e.kind === 'warning' ? 'warn' : e.kind === 'value' ? 'value' : 'info'}>
            {e.text}
          </Note>
        ))}

        {days[activeDay] && (
          <DayCard
            day={days[activeDay]}
            eaters={state.eaters.length}
            onSwap={(dish, slot) => setSwapping({ dish, slot })}
          />
        )}

        <p className="px-2 pt-1 text-center text-[11px] leading-relaxed text-surface-400">
          {totals?.dishes} разных блюд · рассчитано за {menu.solveTimeMs} мс
          <br />
          Точка слева — готовить, серая — разогреть готовое
          <br />
          Нажмите на блюдо — состав, рецепт и замена
        </p>
      </div>

      {swapping && (
        <RecipeSheet
          dish={swapping.dish}
          eaters={state.eaters.length}
          alternatives={alternatives}
          onClose={() => setSwapping(null)}
          onMark={(event) => store.markDish(swapping.dish.recipe.id, event)}
          onPick={(alt) => {
            swapDish(activeDay, swapping.slot, swapping.dish.recipe.id, alt.stats);
            setSwapping(null);
          }}
        />
      )}
    </div>
  );
}
