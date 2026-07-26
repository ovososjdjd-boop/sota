import { useEffect, useRef, useState } from 'react';
import { Card, Ring, Note, Spinner, Button } from '../ui/primitives';
import { cx } from '../ui/cx';
import {
  money,
  moneyPlain,
  mass,
  deviationTone,
  days as fmtDays,
  positions,
} from '../core/format';
import { CATEGORY_LABEL } from '../core/types';
import { pickMeasure, formatRange } from '../core/measures';
import type { Store } from '../state/store';
import type { BasketItem } from '../core/types';

/** Живой бюджет-бар: сколько потрачено, сколько осталось. */
function BudgetBar({
  spent,
  budget,
  animate,
}: {
  spent: number;
  budget: number;
  animate: boolean;
}) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const left = budget - spent;
  const tight = left < budget * 0.05;

  return (
    <div className="px-5 pb-4 pt-3">
      <div className="mb-2.5 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-400">
            Потрачено
          </div>
          <div
            className={cx(
              'tnum text-money-sm text-surface-900 dark:text-white',
              animate && 'animate-pulse-once',
            )}
          >
            {moneyPlain(spent)}{' '}
            <span className="text-lg font-semibold text-surface-400">
              из {moneyPlain(budget)} ₽
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-400">
            Остаток
          </div>
          <div
            className={cx(
              'tnum text-lg font-bold',
              tight ? 'text-amber-600' : 'text-brand-600 dark:text-brand-400',
            )}
          >
            {moneyPlain(Math.max(0, left))} ₽
          </div>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-700 ease-smooth"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Карточка одной позиции корзины. */
function ItemCard({ item, onOpen }: { item: BasketItem; onOpen: () => void }) {
  const q = pickMeasure(item.product, item.grams);
  const portionText = q ? formatRange(q) : mass(item.grams);

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-card transition-transform duration-200 active:scale-[0.99] dark:bg-surface-900"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-surface-900 dark:text-white">
          {item.product.name}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-surface-500 dark:text-surface-400">
          <span className="font-medium text-brand-600 dark:text-brand-400">
            {portionText}
          </span>
          <span className="text-surface-300 dark:text-surface-700">·</span>
          <span>{mass(item.grams)}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="tnum text-[15px] font-bold text-surface-900 dark:text-white">
          {moneyPlain(item.cost)} ₽
        </div>
        <div className="tnum text-[11px] text-surface-400">
          {Math.round(item.nutrients.kcal)} ккал
        </div>
      </div>
    </button>
  );
}

/** Детали продукта — открываются по тапу. */
function ItemSheet({
  item,
  onClose,
  onExclude,
  onPrice,
  overridePrice,
}: {
  item: BasketItem;
  onClose: () => void;
  onExclude: () => void;
  onPrice: (v: number | null) => void;
  overridePrice?: number;
}) {
  const [price, setPrice] = useState(String(Math.round(item.product.pricePerKg)));
  const q = pickMeasure(item.product, item.grams);

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full animate-rise rounded-t-3xl bg-white p-5 pb-8 shadow-lift dark:bg-surface-900"
        style={{ paddingBottom: 'calc(2rem + var(--safe-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-300 dark:bg-surface-700" />

        <h3 className="text-xl font-bold text-surface-900 dark:text-white">
          {item.product.name}
        </h3>
        <p className="mt-0.5 text-sm text-surface-400">
          {CATEGORY_LABEL[item.product.category]}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-50 p-3.5 dark:bg-surface-800">
            <div className="text-[11px] font-semibold uppercase text-surface-400">
              Сколько взять
            </div>
            <div className="mt-1 text-lg font-bold text-brand-600 dark:text-brand-400">
              {q ? q.text : mass(item.grams)}
            </div>
            <div className="text-xs text-surface-400">{mass(item.grams)}</div>
          </div>
          <div className="rounded-2xl bg-surface-50 p-3.5 dark:bg-surface-800">
            <div className="text-[11px] font-semibold uppercase text-surface-400">
              Купить упаковок
            </div>
            <div className="mt-1 text-lg font-bold text-surface-900 dark:text-white">
              {item.packsToBuy} шт
            </div>
            {item.leftoverGrams > 5 && (
              <div className="text-xs text-surface-400">
                останется {mass(item.leftoverGrams)}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 rounded-2xl bg-surface-50 p-3.5 dark:bg-surface-800">
          {[
            ['Ккал', Math.round(item.nutrients.kcal)],
            ['Белки', `${Math.round(item.nutrients.protein)} г`],
            ['Жиры', `${Math.round(item.nutrients.fat)} г`],
            ['Углев.', `${Math.round(item.nutrients.carbs)} г`],
          ].map(([label, value]) => (
            <div key={label as string} className="text-center">
              <div className="tnum text-sm font-bold text-surface-900 dark:text-white">
                {value}
              </div>
              <div className="text-[10px] text-surface-400">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm font-semibold text-surface-600 dark:text-surface-300">
            Цена за кг — поправьте под свой магазин
          </label>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
              className="tnum h-12 flex-1 rounded-2xl bg-surface-100 px-4 text-base font-semibold text-surface-900 outline-none ring-brand-500 focus:ring-2 dark:bg-surface-800 dark:text-white"
            />
            <Button
              onClick={() => {
                const v = Number(price);
                onPrice(v > 0 ? v : null);
                onClose();
              }}
            >
              Сохранить
            </Button>
          </div>
          {overridePrice != null && (
            <button
              onClick={() => {
                onPrice(null);
                onClose();
              }}
              className="mt-2 text-xs font-medium text-surface-400 underline"
            >
              Вернуть цену Росстата
            </button>
          )}
        </div>

        <Button
          variant="danger"
          full
          className="mt-4"
          onClick={() => {
            onExclude();
            onClose();
          }}
        >
          Не предлагать этот продукт
        </Button>
      </div>
    </div>
  );
}

export function PlanScreen({ store }: { store: Store }) {
  const { state, plan, calculating, recalculate, setPrice, toggleExcluded } = store;
  const [openItem, setOpenItem] = useState<BasketItem | null>(null);
  const [pulse, setPulse] = useState(false);
  const prevCost = useRef(0);

  useEffect(() => {
    if (!plan) {
      void recalculate();
      return;
    }
    if (plan.totalCost !== prevCost.current) {
      prevCost.current = plan.totalCost;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 450);
      return () => clearTimeout(t);
    }
  }, [plan, recalculate]);

  if (calculating && !plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-surface-400">
        <Spinner className="text-brand-500" />
        <p className="text-sm">Подбираем рацион…</p>
      </div>
    );
  }

  if (!plan) return null;

  if (plan.status !== 'optimal') {
    return (
      <div className="px-5 py-8">
        <Card className="p-6 text-center">
          <div className="mb-3 text-4xl">🤔</div>
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">
            На эту сумму не получится
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-surface-500 dark:text-surface-400">
            {plan.explanations[0]?.text ??
              'Сбалансированный рацион в этот бюджет не помещается.'}
          </p>
          {plan.minimumFeasibleBudget && (
            <Button
              full
              className="mt-5"
              onClick={() => {
                store.update({
                  budget: Math.ceil(plan.minimumFeasibleBudget! / 50) * 50,
                });
                setTimeout(() => void recalculate(), 30);
              }}
            >
              Поставить {money(Math.ceil(plan.minimumFeasibleBudget / 50) * 50)}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  const perDay = {
    kcal: plan.actual.kcal / state.days,
    protein: plan.actual.protein / state.days,
    fat: plan.actual.fat / state.days,
    carbs: plan.actual.carbs / state.days,
  };
  const targetPerDay = {
    kcal: plan.target.kcal / state.days,
    protein: plan.target.protein / state.days,
    fat: plan.target.fat / state.days,
    carbs: plan.target.carbs / state.days,
  };

  // группировка по категориям
  const byCategory = new Map<string, BasketItem[]>();
  for (const item of plan.items) {
    const list = byCategory.get(item.product.category) ?? [];
    list.push(item);
    byCategory.set(item.product.category, list);
  }

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-20 border-b border-surface-200/70 bg-surface-50/90 backdrop-blur-xl dark:border-surface-800 dark:bg-surface-950/90">
        <BudgetBar spent={plan.totalCost} budget={state.budget} animate={pulse} />
      </div>

      <div className="space-y-4 px-4 pt-4">
        {/* КБЖУ в день */}
        <Card className="p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-surface-900 dark:text-white">
              В день на человека
            </h2>
            <span className="text-xs text-surface-400">
              {fmtDays(state.days)} · {state.eaters.length} чел
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <Ring
              value={perDay.kcal / state.eaters.length}
              target={targetPerDay.kcal / state.eaters.length}
              label="Ккал"
              tone={deviationTone(plan.deviation.kcal)}
            />
            <Ring
              value={perDay.protein / state.eaters.length}
              target={targetPerDay.protein / state.eaters.length}
              label="Белки"
              unit="г"
              tone={deviationTone(plan.deviation.protein)}
            />
            <Ring
              value={perDay.fat / state.eaters.length}
              target={targetPerDay.fat / state.eaters.length}
              label="Жиры"
              unit="г"
              tone={deviationTone(plan.deviation.fat)}
            />
            <Ring
              value={perDay.carbs / state.eaters.length}
              target={targetPerDay.carbs / state.eaters.length}
              label="Углев."
              unit="г"
              tone={deviationTone(plan.deviation.carbs)}
            />
          </div>
        </Card>

        {/* объяснения */}
        {plan.explanations.length > 0 && (
          <div className="space-y-2">
            {plan.explanations.slice(0, 3).map((e, i) => (
              <Note key={i} tone={e.kind === 'warning' ? 'warn' : e.kind === 'value' ? 'value' : 'info'}>
                {e.text}
              </Note>
            ))}
          </div>
        )}

        {/* корзина */}
        <div>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-base font-bold text-surface-900 dark:text-white">
              Список покупок
            </h2>
            <span className="text-xs text-surface-400">
              {positions(plan.items.length)}
            </span>
          </div>

          <div className="space-y-4">
            {[...byCategory.entries()].map(([cat, items]) => (
              <div key={cat}>
                <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-surface-400">
                  {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]}
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <ItemCard
                      key={item.product.id}
                      item={item}
                      onOpen={() => setOpenItem(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="px-2 pt-2 text-center text-[11px] leading-relaxed text-surface-400">
          Рассчитано за {plan.solveTimeMs} мс · цены Росстата, июнь 2026
          <br />
          Инструмент планирования бюджета, не медицинская рекомендация
        </p>
      </div>

      {openItem && (
        <ItemSheet
          item={openItem}
          overridePrice={state.priceOverrides[openItem.product.id]}
          onClose={() => setOpenItem(null)}
          onExclude={() => {
            toggleExcluded(openItem.product.id);
            setTimeout(() => void recalculate(), 30);
          }}
          onPrice={(v) => {
            setPrice(openItem.product.id, v);
            setTimeout(() => void recalculate(), 30);
          }}
        />
      )}
    </div>
  );
}
