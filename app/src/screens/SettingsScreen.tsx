import { Card, Button, Segmented } from '../ui/primitives';
import { cx } from '../ui/cx';
import { Icon } from '../ui/icons';
import { moneyPlain } from '../core/format';
import {
  ACTIVITY_LABEL,
  GOAL_LABEL,
  type ActivityLevel,
  type Goal,
  type EaterProfile,
} from '../core/types';
import { dailyTargets } from '../core/nutrition';
import type { Store } from '../state/store';
import { PRODUCT_BY_ID } from '../data/products';

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-surface-500 dark:text-surface-400">
        {label}
      </label>
      <div className="flex items-center gap-1.5 rounded-xl bg-surface-100 px-3 dark:bg-surface-800">
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
          className="tnum h-11 w-full bg-transparent text-[15px] font-semibold text-surface-900 outline-none dark:text-white"
        />
        {suffix && <span className="text-xs text-surface-400">{suffix}</span>}
      </div>
    </div>
  );
}

function EaterCard({
  eater,
  store,
  canRemove,
}: {
  eater: EaterProfile;
  store: Store;
  canRemove: boolean;
}) {
  const { setEater, removeEater, recalculate } = store;
  const targets = dailyTargets(eater);

  const change = (patch: Partial<EaterProfile>) => {
    setEater(eater.id, patch);
    setTimeout(() => void recalculate(), 200);
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <input
          value={eater.name}
          onChange={(e) => setEater(eater.id, { name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-base font-bold text-surface-900 outline-none dark:text-white"
        />
        {canRemove && (
          <button
            onClick={() => {
              removeEater(eater.id);
              setTimeout(() => void recalculate(), 30);
            }}
            className="ml-2 shrink-0 text-xs font-medium text-red-500"
          >
            Убрать
          </button>
        )}
      </div>

      <div className="mb-3">
        <Segmented
          value={eater.sex}
          onChange={(v) => change({ sex: v })}
          options={[
            { value: 'male' as const, label: 'Мужчина' },
            { value: 'female' as const, label: 'Женщина' },
          ]}
        />
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Field label="Возраст" value={eater.age} onChange={(v) => change({ age: v })} suffix="лет" />
        <Field label="Рост" value={eater.heightCm} onChange={(v) => change({ heightCm: v })} suffix="см" />
        <Field label="Вес" value={eater.weightKg} onChange={(v) => change({ weightKg: v })} suffix="кг" />
      </div>

      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-semibold text-surface-500 dark:text-surface-400">
          Образ жизни
        </label>
        <select
          value={eater.activity}
          onChange={(e) => change({ activity: e.target.value as ActivityLevel })}
          className="h-11 w-full rounded-xl bg-surface-100 px-3 text-[15px] font-medium text-surface-900 outline-none dark:bg-surface-800 dark:text-white"
        >
          {Object.entries(ACTIVITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold text-surface-500 dark:text-surface-400">
          Цель
        </label>
        <Segmented
          value={eater.goal}
          onChange={(v) => change({ goal: v as Goal })}
          options={Object.entries(GOAL_LABEL).map(([k, v]) => ({
            value: k as Goal,
            label: v,
          }))}
        />
      </div>

      <div className="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-950/40">
        <div className="text-[11px] font-semibold uppercase text-brand-700 dark:text-brand-400">
          Норма в день
        </div>
        <div className="tnum mt-0.5 text-sm font-bold text-brand-800 dark:text-brand-300">
          ≈{Math.round(targets.kcal.target / 10) * 10} ккал · Б{' '}
          {Math.round(targets.protein.target)} · Ж {Math.round(targets.fat.target)} · У{' '}
          {Math.round(targets.carbs.target)}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-brand-700/70 dark:text-brand-400/70">
          Расчёт по формуле Mifflin-St Jeor. У половины людей такие формулы
          ошибаются на ±10% — это ориентир, а не точная величина.
        </div>
      </div>
    </Card>
  );
}

export function SettingsScreen({ store }: { store: Store }) {
  const { state, update, addEater, recalculate, toggleExcluded, setPrice, toggleTheme, reset } =
    store;

  return (
    <div className="space-y-4 px-4 py-5 pb-8">
      <Card className="p-5">
        <h2 className="mb-4 text-base font-bold text-surface-900 dark:text-white">
          Бюджет и срок
        </h2>
        <label className="mb-1.5 block text-xs font-semibold text-surface-500 dark:text-surface-400">
          Сумма на весь период
        </label>
        <div className="mb-4 flex items-baseline gap-2 rounded-xl bg-surface-100 px-4 dark:bg-surface-800">
          <input
            inputMode="numeric"
            value={moneyPlain(state.budget)}
            onChange={(e) => {
              update({ budget: Number(e.target.value.replace(/\D/g, '')) || 0 });
              setTimeout(() => void recalculate(), 250);
            }}
            className="tnum h-14 w-full bg-transparent text-2xl font-bold text-surface-900 outline-none dark:text-white"
          />
          <span className="text-lg font-semibold text-surface-400">₽</span>
        </div>
        <Segmented
          value={state.days}
          onChange={(v) => {
            update({ days: v });
            setTimeout(() => void recalculate(), 30);
          }}
          options={[
            { value: 7, label: 'Неделя' },
            { value: 14, label: '2 недели' },
            { value: 30, label: 'Месяц' },
          ]}
        />
      </Card>

      <div>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-surface-900 dark:text-white">
            Кто ест
          </h2>
          <button
            onClick={() => {
              addEater();
              setTimeout(() => void recalculate(), 30);
            }}
            className="text-sm font-semibold text-brand-600 dark:text-brand-400"
          >
            + Добавить
          </button>
        </div>
        <div className="space-y-3">
          {state.eaters.map((e) => (
            <EaterCard
              key={e.id}
              eater={e}
              store={store}
              canRemove={state.eaters.length > 1}
            />
          ))}
        </div>
      </div>

      {state.excluded.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-surface-900 dark:text-white">
            Исключённые продукты
          </h2>
          <div className="flex flex-wrap gap-2">
            {state.excluded.map((id) => (
              <button
                key={id}
                onClick={() => {
                  toggleExcluded(id);
                  setTimeout(() => void recalculate(), 30);
                }}
                className="rounded-full bg-surface-100 px-3.5 py-2 text-[13px] font-medium text-surface-600 transition active:scale-95 dark:bg-surface-800 dark:text-surface-300"
              >
                {PRODUCT_BY_ID[id]?.name ?? id} ✕
              </button>
            ))}
          </div>
        </Card>
      )}

      {Object.keys(state.priceOverrides).length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-surface-900 dark:text-white">
            Свои цены
          </h2>
          <div className="space-y-2">
            {Object.entries(state.priceOverrides).map(([id, price]) => (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className="text-surface-600 dark:text-surface-300">
                  {PRODUCT_BY_ID[id]?.name ?? id}
                </span>
                <div className="flex items-center gap-2">
                  <span className="tnum font-semibold text-surface-900 dark:text-white">
                    {price} ₽/кг
                  </span>
                  <button
                    onClick={() => {
                      setPrice(id, null);
                      setTimeout(() => void recalculate(), 30);
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

      <Card className="p-5">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center justify-between"
        >
          <span className="text-[15px] font-semibold text-surface-900 dark:text-white">
            Тёмная тема
          </span>
          <div
            className={cx(
              'flex h-8 w-14 items-center rounded-full p-1 transition-colors',
              state.theme === 'dark' ? 'bg-brand-500' : 'bg-surface-300',
            )}
          >
            <div
              className={cx(
                'flex h-6 w-6 items-center justify-center rounded-full bg-white text-surface-600 transition-transform duration-300',
                state.theme === 'dark' && 'translate-x-6',
              )}
            >
              {state.theme === 'dark' ? (
                <Icon.Moon className="h-3.5 w-3.5" />
              ) : (
                <Icon.Sun className="h-3.5 w-3.5" />
              )}
            </div>
          </div>
        </button>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-bold text-surface-900 dark:text-white">
          Об источниках данных
        </h2>
        <p className="text-[13px] leading-relaxed text-surface-500 dark:text-surface-400">
          Цены — Росстат, средние потребительские цены по России, июнь 2026.
          Состав продуктов — справочник Скурихина и Тутельяна (НИИ питания РАМН).
          Нормы потребления — МР 2.3.1.2432-08 и формула Mifflin-St Jeor.
          Всё считается на вашем устройстве, данные никуда не отправляются.
        </p>
      </Card>

      <Button
        variant="ghost"
        full
        onClick={() => {
          if (confirm('Сбросить все настройки?')) reset();
        }}
      >
        Сбросить всё
      </Button>
    </div>
  );
}
