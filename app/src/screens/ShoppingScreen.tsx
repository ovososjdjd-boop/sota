import { useMemo, useState } from 'react';
import { Button, Note } from '../ui/primitives';
import { cx } from '../ui/cx';
import { Icon } from '../ui/icons';
import { money, moneyPlain, mass, positions } from '../core/format';
import { CATEGORY_LABEL, type ProductCategory } from '../core/types';
import { packsNeeded, grossFromNet } from '../core/measures';
import type { Store } from '../state/store';
import type { BasketItem } from '../core/types';

/**
 * Экран покупок: то, с чем человек идёт в магазин.
 *
 * Отличия от экрана меню:
 *  - показываем УПАКОВКИ, а не порции (в магазине продают пачками)
 *  - группировка по отделам магазина, а не по пищевым категориям
 *  - чекбоксы с сохранением, чтобы отмечать по ходу
 *  - экспорт в текст: переслать себе или распечатать
 */

/** Порядок обхода магазина — как реально ходят по залу. */
const AISLE_ORDER: ProductCategory[] = [
  'vegetable',
  'fruit',
  'grain',
  'legume',
  'bread',
  'meat',
  'fish',
  'dairy',
  'egg',
  'fat',
  'nut',
  'sweet',
  'other',
];

const AISLE_LABEL: Partial<Record<ProductCategory, string>> = {
  vegetable: 'Овощи',
  fruit: 'Фрукты',
  grain: 'Бакалея: крупы',
  legume: 'Бакалея: бобовые',
  bread: 'Хлебный отдел',
  meat: 'Мясо и птица',
  fish: 'Рыба',
  dairy: 'Молочный отдел',
  egg: 'Яйца',
  fat: 'Масло и жиры',
  nut: 'Орехи и сухофрукты',
  sweet: 'Сладкое',
  other: 'Прочее',
};

interface Line {
  item: BasketItem;
  packs: number;
  packSize: number;
  totalGrams: number;
  leftover: number;
  cost: number;
}

function buildLines(items: BasketItem[]): Line[] {
  return items.map((item) => {
    const gross = grossFromNet(item.product, item.grams);
    const p = packsNeeded(item.product, gross);
    return {
      item,
      packs: p.packs,
      packSize: p.packSize,
      totalGrams: p.totalGrams,
      leftover: p.leftover,
      cost: (p.totalGrams / 1000) * item.product.pricePerKg,
    };
  });
}

function toPlainText(lines: Line[], total: number, days: number, eaters: number): string {
  const groups = new Map<ProductCategory, Line[]>();
  for (const l of lines) {
    const c = l.item.product.category;
    groups.set(c, [...(groups.get(c) ?? []), l]);
  }
  const parts: string[] = [
    `СПИСОК ПОКУПОК`,
    `На ${days} дн. · ${eaters} чел. · примерно ${Math.round(total)} ₽`,
    '',
  ];
  for (const cat of AISLE_ORDER) {
    const g = groups.get(cat);
    if (!g?.length) continue;
    parts.push(`— ${AISLE_LABEL[cat] ?? CATEGORY_LABEL[cat]}`);
    for (const l of g) {
      const packInfo =
        l.item.product.packSizes.length > 0
          ? `${l.packs} × ${mass(l.packSize)}`
          : mass(l.totalGrams);
      parts.push(`  [ ] ${l.item.product.name} — ${packInfo} · ${Math.round(l.cost)} ₽`);
    }
    parts.push('');
  }
  parts.push('Цены ориентировочные: Росстат, средние по России.');
  return parts.join('\n');
}

export function ShoppingScreen({ store }: { store: Store }) {
  const { state, plan } = store;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => (plan ? buildLines(plan.items) : []), [plan]);

  const grouped = useMemo(() => {
    const map = new Map<ProductCategory, Line[]>();
    for (const l of lines) {
      const c = l.item.product.category;
      map.set(c, [...(map.get(c) ?? []), l]);
    }
    return AISLE_ORDER.filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [lines]);

  if (!plan || plan.status !== 'optimal') {
    return (
      <div className="px-5 py-10 text-center text-sm text-surface-400">
        Сначала составьте меню на вкладке «Меню».
      </div>
    );
  }

  const totalPacksCost = lines.reduce((s, l) => s + l.cost, 0);
  const done = lines.filter((l) => checked.has(l.item.product.id)).length;
  const leftoverValue = lines.reduce(
    (s, l) => s + (l.leftover / 1000) * l.item.product.pricePerKg,
    0,
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function share() {
    const text = toPlainText(lines, totalPacksCost, state.days, state.eaters.length);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Список покупок', text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // пользователь отменил — ничего не делаем
    }
  }

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-20 border-b border-surface-200/70 bg-surface-50/90 px-5 py-4 backdrop-blur-xl dark:border-surface-800 dark:bg-surface-950/90">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-400">
              К оплате в магазине
            </div>
            <div className="tnum text-money-sm text-surface-900 dark:text-white">
              {moneyPlain(totalPacksCost)} <span className="text-lg text-surface-400">₽</span>
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-lg font-bold text-brand-600 dark:text-brand-400">
              {done} / {lines.length}
            </div>
            <div className="text-[11px] text-surface-400">собрано</div>
          </div>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-smooth"
            style={{ width: `${lines.length ? (done / lines.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {totalPacksCost > plan.totalCost * 1.08 && (
          <Note tone="info">
            В магазине выйдет дороже расчёта: продукты продаются упаковками.
            Излишек примерно на {money(leftoverValue)} останется на следующий период —
            это не потеря, а запас.
          </Note>
        )}

        {grouped.map(([cat, items]) => (
          <div key={cat}>
            <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-surface-400">
              {AISLE_LABEL[cat] ?? CATEGORY_LABEL[cat]}
            </div>
            <div className="space-y-2">
              {items.map((l) => {
                const isChecked = checked.has(l.item.product.id);
                return (
                  <button
                    key={l.item.product.id}
                    onClick={() => toggle(l.item.product.id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left shadow-card transition-all duration-200 active:scale-[0.99]',
                      isChecked
                        ? 'bg-surface-100 dark:bg-surface-900/50'
                        : 'bg-white dark:bg-surface-900',
                    )}
                  >
                    <div
                      className={cx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                        isChecked
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-surface-300 dark:border-surface-600',
                      )}
                    >
                      {isChecked && <Icon.Check className="h-3.5 w-3.5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div
                        className={cx(
                          'truncate text-[15px] font-semibold transition-colors',
                          isChecked
                            ? 'text-surface-400 line-through dark:text-surface-600'
                            : 'text-surface-900 dark:text-white',
                        )}
                      >
                        {l.item.product.name}
                      </div>
                      <div className="mt-0.5 text-[13px] text-surface-500 dark:text-surface-400">
                        {l.item.product.packSizes.length > 0 ? (
                          <span className="font-medium text-brand-600 dark:text-brand-400">
                            {l.packs} × {mass(l.packSize)}
                          </span>
                        ) : (
                          <span className="font-medium text-brand-600 dark:text-brand-400">
                            {mass(l.totalGrams)}
                          </span>
                        )}
                        {l.leftover > 50 && (
                          <span className="text-surface-400">
                            {' '}
                            · останется {mass(l.leftover)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className={cx(
                        'tnum text-[15px] font-bold',
                        isChecked
                          ? 'text-surface-300 dark:text-surface-700'
                          : 'text-surface-900 dark:text-white',
                      )}
                    >
                      {moneyPlain(l.cost)} ₽
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" full onClick={() => setChecked(new Set())}>
            Сбросить
          </Button>
          <Button full onClick={share}>
            {copied ? 'Скопировано' : 'Поделиться'}
          </Button>
        </div>

        <p className="px-2 text-center text-[11px] leading-relaxed text-surface-400">
          {positions(lines.length)} · на {state.days} дн. для {state.eaters.length} чел.
          <br />
          Цены ориентировочные — в вашем магазине могут отличаться
        </p>
      </div>
    </div>
  );
}
