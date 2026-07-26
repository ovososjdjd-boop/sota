import { useMemo, useState } from 'react';
import { Button } from '../ui/primitives';
import { cx } from '../ui/cx';
import { mass, moneyPlain } from '../core/format';
import { ROLE_LABEL, recipePortions } from '../core/recipes';
import type { PlannedDish } from '../core/menu';
import type { SwapCandidate } from '../core/swap';

/**
 * Карточка рецепта — то, чего в приложении не было вовсе.
 *
 * Отзыв пользователя: «Приложение говорит "Свинина тушёная, 622 ккал,
 * 60 минут". Что мне с этим делать? Сколько брать свинины?»
 *
 * Здесь: состав на нужное число порций в домашних мерах, шаги
 * приготовления и КБЖУ. Отсюда же можно заменить блюдо.
 */

const METHOD_LABEL: Record<string, string> = {
  boiled: 'отварить',
  fried: 'обжарить',
  baked: 'запечь',
  stewed: 'потушить',
  raw: '',
};

export function RecipeSheet({
  dish,
  eaters,
  alternatives,
  onPick,
  onClose,
}: {
  dish: PlannedDish;
  eaters: number;
  alternatives: SwapCandidate[];
  onPick: (c: SwapCandidate) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'recipe' | 'swap'>('recipe');

  const portions = Math.max(1, dish.portions);
  const items = useMemo(
    () => recipePortions(dish.recipe, portions),
    [dish.recipe, portions],
  );

  const n = dish.stats.nutrients;
  const total = {
    kcal: n.kcal * portions,
    protein: n.protein * portions,
    fat: n.fat * portions,
    carbs: n.carbs * portions,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88vh] w-full animate-rise overflow-y-auto rounded-t-3xl bg-white shadow-lift dark:bg-surface-900"
        style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom))' }}
      >
        {/* шапка */}
        <div className="sticky top-0 z-10 bg-white px-5 pb-3 pt-3 dark:bg-surface-900">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-300 dark:bg-surface-700" />
          <h2 className="text-xl font-bold leading-tight text-surface-900 dark:text-white">
            {dish.recipe.name}
          </h2>
          <p className="mt-0.5 text-[13px] text-surface-400">
            {ROLE_LABEL[dish.recipe.role]} · {dish.recipe.minutes} мин ·{' '}
            {portions > 1 ? `${portions} порции` : '1 порция'}
            {!dish.cooked && ' · разогреть готовое'}
          </p>

          <div className="mt-3 flex gap-1 rounded-2xl bg-surface-100 p-1 dark:bg-surface-800">
            {(
              [
                ['recipe', 'Рецепт'],
                ['swap', `Заменить${alternatives.length ? ` (${alternatives.length})` : ''}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cx(
                  'flex-1 rounded-xl py-2 text-[13px] font-semibold transition-all',
                  tab === id
                    ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-white'
                    : 'text-surface-500 dark:text-surface-400',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'recipe' ? (
          <div className="px-5">
            {/* КБЖУ */}
            <div className="mt-1 grid grid-cols-4 gap-2 rounded-2xl bg-surface-50 p-3.5 dark:bg-surface-800">
              {(
                [
                  ['Ккал', Math.round(total.kcal)],
                  ['Белки', `${Math.round(total.protein)} г`],
                  ['Жиры', `${Math.round(total.fat)} г`],
                  ['Углев.', `${Math.round(total.carbs)} г`],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="text-center">
                  <div className="tnum text-sm font-bold text-surface-900 dark:text-white">
                    {value}
                  </div>
                  <div className="text-[10px] text-surface-400">{label}</div>
                </div>
              ))}
            </div>

            {/* состав */}
            <h3 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-surface-400">
              Что взять {portions > 1 && `на ${portions} порции`}
            </h3>
            <div className="space-y-1.5">
              {items.map((it) => (
                <div
                  key={it.productId}
                  className="flex items-baseline justify-between gap-3 border-b border-surface-100 pb-1.5 last:border-0 dark:border-surface-800"
                >
                  <span className="text-[14px] text-surface-900 dark:text-surface-100">
                    {it.name}
                    {it.method && METHOD_LABEL[it.method] && (
                      <span className="text-surface-400"> · {METHOD_LABEL[it.method]}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">
                      {it.measure}
                    </span>
                    <span className="ml-1.5 text-[12px] text-surface-400">
                      {mass(it.grams)}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {/* шаги */}
            {dish.recipe.steps && dish.recipe.steps.length > 0 && (
              <>
                <h3 className="mb-2.5 mt-6 text-[11px] font-bold uppercase tracking-wide text-surface-400">
                  Как готовить
                </h3>
                <ol className="space-y-3">
                  {dish.recipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-400">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-[14px] leading-relaxed text-surface-700 dark:text-surface-200">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            <p className="mt-6 text-center text-[11px] leading-relaxed text-surface-400">
              Порция ≈ {mass(dish.stats.cookedGrams)} готового блюда
              {eaters > 1 && ` · рассчитано на ${eaters} чел.`}
            </p>
          </div>
        ) : (
          <div className="px-5 pt-1">
            {alternatives.length === 0 ? (
              <p className="py-10 text-center text-sm text-surface-400">
                Подходящих замен не нашлось
              </p>
            ) : (
              <div className="space-y-2">
                {alternatives.map((alt) => (
                  <button
                    key={alt.stats.recipe.id}
                    onClick={() => onPick(alt)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-surface-50 px-4 py-3 text-left transition-transform active:scale-[0.99] dark:bg-surface-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-surface-900 dark:text-white">
                        {alt.stats.recipe.name}
                      </div>
                      <div className="mt-0.5 text-[12px] text-surface-400">
                        {ROLE_LABEL[alt.stats.recipe.role]} ·{' '}
                        {alt.stats.recipe.minutes} мин · Б{' '}
                        {Math.round(alt.stats.nutrients.protein)} г
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-[13px] font-semibold text-surface-900 dark:text-white">
                        {Math.round(alt.stats.nutrients.kcal)} ккал
                      </div>
                      <div
                        className={cx(
                          'tnum text-[11px]',
                          alt.costDelta < 0
                            ? 'text-brand-600'
                            : 'text-surface-400',
                        )}
                      >
                        {alt.costDelta >= 0 ? '+' : ''}
                        {moneyPlain(alt.costDelta)} ₽
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-5 pt-5">
          <Button variant="secondary" full onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}
