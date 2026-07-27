import { useState } from 'react';
import { Button, Segmented, Card } from '../ui/primitives';

import { moneyPlain, people } from '../core/format';
import type { Store } from '../state/store';
import { makeEater } from '../state/store';

/**
 * Первый экран. Принцип: одно главное поле — сумма. Крупно.
 * Всё остальное — потом, когда результат уже виден.
 */
export function Onboarding({ store }: { store: Store }) {
  const { state, update, recalculate } = store;
  const [budget, setBudget] = useState(String(state.budget));
  const [count, setCount] = useState(state.eaters.length);
  const [period, setPeriod] = useState(state.days);
  const [busy, setBusy] = useState(false);

  const numeric = Number(budget.replace(/\D/g, '')) || 0;
  const perDay = numeric > 0 && period > 0 ? numeric / period / Math.max(1, count) : 0;

  async function start() {
    setBusy(true);
    const eaters = Array.from({ length: count }, (_, i) =>
      i < state.eaters.length
        ? state.eaters[i]
        : makeEater({ name: `Человек ${i + 1}` }),
    );
    update({ budget: numeric, days: period, eaters, onboarded: true });
    // даём стейту примениться перед расчётом
    setTimeout(() => {
      recalculate().finally(() => setBusy(false));
    }, 30);
  }

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-brand-50 to-surface-50 px-5 pb-8 pt-14 dark:from-surface-950 dark:to-surface-950">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-9 animate-rise">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
            Работает без интернета
          </div>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-surface-900 dark:text-white">
            Меню под ваш бюджет
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-surface-500 dark:text-surface-400">
            Назовите сумму — соберём рацион, который в неё уложится
            и попадёт в норму по калориям и белку.
          </p>
        </div>

        <Card className="mb-4 animate-rise p-6" >
          <label className="mb-2 block text-sm font-semibold text-surface-500 dark:text-surface-400">
            Сколько готовы потратить
          </label>
          <div className="flex items-baseline gap-2">
            <input
              inputMode="numeric"
              autoFocus
              value={budget === '0' ? '' : moneyPlain(numeric)}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="5 000"
              className="tnum w-full bg-transparent text-money text-surface-900 outline-none placeholder:text-surface-300 dark:text-white dark:placeholder:text-surface-700"
            />
            <span className="text-money-sm text-surface-400">₽</span>
          </div>
          {perDay > 0 && (
            <p className="mt-3 text-[13px] text-surface-400 dark:text-surface-500">
              Это {Math.round(perDay)} ₽ в день на человека
            </p>
          )}
        </Card>

        <Card className="mb-4 animate-rise space-y-5 p-5">
          <div>
            <label className="mb-2.5 block text-sm font-semibold text-surface-600 dark:text-surface-300">
              На какой срок
            </label>
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: 7, label: 'Неделя' },
                { value: 14, label: '2 недели' },
                { value: 30, label: 'Месяц' },
              ]}
            />
          </div>

          <div>
            <label className="mb-2.5 block text-sm font-semibold text-surface-600 dark:text-surface-300">
              Сколько человек
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCount(Math.max(1, count - 1))}
                className="h-12 w-12 rounded-2xl bg-surface-100 text-xl font-bold text-surface-600 transition active:scale-95 dark:bg-surface-800 dark:text-surface-300"
              >
                −
              </button>
              <div className="flex-1 text-center">
                <span className="tnum text-2xl font-bold text-surface-900 dark:text-white">
                  {count}
                </span>
                <span className="ml-1.5 text-sm text-surface-400">
                  {people(count).split(' ')[1]}
                </span>
              </div>
              <button
                onClick={() => setCount(Math.min(8, count + 1))}
                className="h-12 w-12 rounded-2xl bg-surface-100 text-xl font-bold text-surface-600 transition active:scale-95 dark:bg-surface-800 dark:text-surface-300"
              >
                +
              </button>
            </div>
          </div>
        </Card>

        <Button
          size="lg"
          full
          disabled={numeric < 100 || busy}
          onClick={start}
          className="animate-rise"
        >
          {busy ? 'Считаем…' : 'Составить меню'}
        </Button>

        {/*
          ТРИ ОТЛИЧИЯ, КОТОРЫХ НЕТ НИ У ОДНОГО КОНКУРЕНТА ОДНОВРЕМЕННО
          (docs/COMPETITORS.md). Раньше они лежали в README для
          разработчиков — то есть их не видел никто из тех, кому они
          адресованы. Человек должен понять ценность за первые
          30 секунд, до того как введёт сумму.

          Формулировки намеренно конкретные: не «умный алгоритм»,
          а что именно приложение делает и чего не делает.
        */}
        <div className="mt-7 space-y-3">
          {[
            {
              title: 'Считает деньги, а не только калории',
              text: 'Лидеры рынка оптимизируют КБЖУ и не знают про бюджет. Мы держим и то, и другое.',
            },
            {
              title: 'Показывает настоящий чек заранее',
              text: 'Продукты продаются упаковками, поэтому в кассе всегда выходит больше. Мы говорим сколько — до похода в магазин.',
            },
            {
              title: 'Работает без интернета и без ИИ',
              text: 'Расчёт идёт на вашем телефоне. Ничего никуда не отправляется, подписка не нужна.',
            },
          ].map((f) => (
            <div key={f.title} className="flex gap-3">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <div>
                <div className="text-[14px] font-semibold text-surface-800 dark:text-surface-100">
                  {f.title}
                </div>
                <div className="mt-0.5 text-[13px] leading-snug text-surface-500 dark:text-surface-400">
                  {f.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-surface-400 dark:text-surface-600">
          Порции — в стаканах, ложках и штуках. Весы не нужны.
          <br />
          Цены: Росстат, средние по России. Их можно поправить.
        </p>
      </div>
    </div>
  );
}
