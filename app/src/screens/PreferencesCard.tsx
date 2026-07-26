import { useMemo, useState } from 'react';
import { Card } from '../ui/primitives';
import { cx } from '../ui/cx';
import { CATEGORY_LABEL, type ProductCategory } from '../core/types';
import { LIKING_LABEL, suggestedProducts, type Liking } from '../core/preferences';
import { RECIPES } from '../data/recipes';
import { PRODUCT_BY_ID } from '../data/products';
import type { Store } from '../state/store';

/**
 * Настройка предпочтений.
 *
 * Показываем самые «влиятельные» продукты — те, что встречаются
 * во многих блюдах. Отметив десяток, человек заметно меняет меню,
 * не перебирая 112 рецептов.
 */

const CYCLE: Liking[] = ['neutral', 'often', 'rare', 'never'];

const TONE: Record<Liking, string> = {
  always: 'bg-brand-600 text-white',
  often: 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300',
  neutral: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400',
  rare: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  never: 'bg-red-100 text-red-700 line-through dark:bg-red-950/60 dark:text-red-400',
};

const SHORT: Record<Liking, string> = {
  always: 'всегда',
  often: 'люблю',
  neutral: '',
  rare: 'редко',
  never: 'нет',
};

export function PreferencesCard({ store }: { store: Store }) {
  const { state, setProductLiking, setDishLiking, recalculateMenu } = store;
  const [expanded, setExpanded] = useState(false);

  const products = useMemo(() => suggestedProducts(RECIPES, 30), []);
  const shown = expanded ? products : products.slice(0, 12);

  const grouped = useMemo(() => {
    const map = new Map<ProductCategory, typeof products>();
    for (const p of shown) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return [...map.entries()];
  }, [shown]);

  // блюда-привычки: то, что человек хочет каждый день
  const habitCandidates = useMemo(
    () =>
      RECIPES.filter(
        (r) => r.role === 'drink' || (r.role === 'snack' && r.minutes <= 3),
      ).slice(0, 10),
    [],
  );

  const cycle = (id: string, current: Liking | undefined) => {
    const now = current ?? 'neutral';
    const next = CYCLE[(CYCLE.indexOf(now) + 1) % CYCLE.length];
    setProductLiking(id, next === 'neutral' ? null : next);
    setTimeout(() => void recalculateMenu(), 250);
  };

  return (
    <>
      <Card className="p-5">
        <h2 className="mb-1 text-base font-bold text-surface-900 dark:text-white">
          Что вы любите
        </h2>
        <p className="mb-4 text-[12px] leading-snug text-surface-400">
          Нажимайте на продукт, чтобы менять отношение: обычно → люблю →
          редко → не предлагать
        </p>

        <div className="space-y-3">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-surface-400">
                {CATEGORY_LABEL[cat]}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((p) => {
                  const liking = state.preferences.products[p.id] ?? 'neutral';
                  return (
                    <button
                      key={p.id}
                      onClick={() => cycle(p.id, liking)}
                      className={cx(
                        'rounded-full px-3 py-1.5 text-[13px] font-medium transition-all active:scale-95',
                        TONE[liking],
                      )}
                    >
                      {p.name}
                      {SHORT[liking] && (
                        <span className="ml-1.5 text-[10px] opacity-80">
                          {SHORT[liking]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {products.length > 12 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 text-[13px] font-semibold text-brand-600 dark:text-brand-400"
          >
            {expanded ? 'Свернуть' : `Показать ещё ${products.length - 12}`}
          </button>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-bold text-surface-900 dark:text-white">
          Каждый день
        </h2>
        <p className="mb-4 text-[12px] leading-snug text-surface-400">
          Привычки, которые должны быть в меню всегда — например, утренний кофе
        </p>
        <div className="flex flex-wrap gap-1.5">
          {habitCandidates.map((r) => {
            const on = state.preferences.dishes[r.id] === 'always';
            return (
              <button
                key={r.id}
                onClick={() => {
                  setDishLiking(r.id, on ? null : 'always');
                  setTimeout(() => void recalculateMenu(), 250);
                }}
                className={cx(
                  'rounded-full px-3 py-1.5 text-[13px] font-medium transition-all active:scale-95',
                  on ? TONE.always : TONE.neutral,
                )}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </Card>

      {Object.keys(state.preferences.products).length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-surface-900 dark:text-white">
            Учтено в меню
          </h2>
          <div className="space-y-1.5">
            {Object.entries(state.preferences.products).map(([id, liking]) => (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className="text-surface-600 dark:text-surface-300">
                  {PRODUCT_BY_ID[id]?.name ?? id}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-surface-500">
                    {LIKING_LABEL[liking]}
                  </span>
                  <button
                    onClick={() => {
                      setProductLiking(id, null);
                      setTimeout(() => void recalculateMenu(), 250);
                    }}
                    className="text-xs text-surface-400"
                  >
                    сброс
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
