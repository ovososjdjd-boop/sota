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
import {
  dailyTargets,
  defaultProteinPerKg,
  PROTEIN_PER_KG_MIN,
  PROTEIN_PER_KG_MAX,
} from '../core/nutrition';
import type { Store } from '../state/store';
import { PreferencesCard } from './PreferencesCard';
import { PRODUCT_BY_ID } from '../data/products';
import { EQUIPMENT_LABEL, EQUIPMENT_HINT, type Equipment } from '../core/equipment';
import { MODE_LABEL, MODE_HINT, type BudgetMode } from '../core/tiers';

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
  const isCustomProtein = eater.proteinPerKg != null;
  const proteinPerKg = eater.proteinPerKg ?? defaultProteinPerKg(eater.goal);

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

      {/*
        Ползунок белка — отдельно от калорий.
        Отзыв: «поставил цель "набрать вес" ради белка — белок вырос,
        но и калории до 3600. Нельзя попросить больше белка при тех же
        калориях». Теперь можно: калорийность держится, меняется состав.
      */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <label className="text-xs font-semibold text-surface-500 dark:text-surface-400">
            Белок
          </label>
          <span className="tnum text-xs font-bold text-brand-600 dark:text-brand-400">
            {proteinPerKg.toFixed(1)} г/кг · {Math.round(proteinPerKg * eater.weightKg)} г в день
          </span>
        </div>
        <input
          type="range"
          min={PROTEIN_PER_KG_MIN}
          max={PROTEIN_PER_KG_MAX}
          step={0.1}
          value={proteinPerKg}
          onChange={(e) => change({ proteinPerKg: Number(e.target.value) })}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-200 accent-brand-600 dark:bg-surface-800"
        />
        <div className="mt-1 flex justify-between text-[10px] text-surface-400">
          <span>0.8 — минимум</span>
          <span>1.2 — обычно</span>
          <span>2.2 — максимум</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-surface-400">
          {isCustomProtein
            ? 'Калории останутся прежними — изменится состав рациона: больше мяса, рыбы и творога вместо круп.'
            : `По вашей цели «${GOAL_LABEL[eater.goal].toLowerCase()}» — ${defaultProteinPerKg(eater.goal)} г/кг. Можно задать своё.`}
        </p>
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
  const {
    state,
    update,
    addEater,
    recalculate,
    recalculateMenu,
    toggleExcluded,
    toggleEquipment,
    setMode,
    menu,
    setPrice,
    toggleTheme,
    reset,
  } = store;

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

      <PreferencesCard store={store} />

      {/*
        КУХНЯ. Рецепт, который нечем приготовить, бесполезен независимо
        от того, как он хорош по КБЖУ и цене. Приложение предлагало
        запеканки людям без духовки — теперь спрашивает.
      */}
      <Card className="p-5">
        <h2 className="mb-1 text-base font-bold text-surface-900 dark:text-white">
          Что есть на кухне
        </h2>
        <p className="mb-3 text-[12px] leading-snug text-surface-400">
          Блюда, которые нечем приготовить, предлагаться не будут
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((item) => {
            const has = state.equipment.includes(item);
            return (
              <button
                key={item}
                onClick={() => {
                  toggleEquipment(item);
                  setTimeout(() => void recalculateMenu(), 30);
                }}
                className={cx(
                  'rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.98]',
                  has
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400',
                )}
              >
                <div className="text-[14px] font-semibold">{EQUIPMENT_LABEL[item]}</div>
                <div className={cx('text-[11px] leading-tight', has ? 'text-white/75' : 'opacity-70')}>
                  {EQUIPMENT_HINT[item]}
                </div>
              </button>
            );
          })}
        </div>
        {!state.equipment.includes('stove') && (
          <p className="mt-2.5 text-[12px] leading-snug text-amber-700 dark:text-amber-400">
            Без плиты меню соберётся из того, что не нужно варить:
            запаренные каши, консервы, блюда для микроволновки.
            Это рабочий вариант для общежития или командировки.
          </p>
        )}
      </Card>

      {/*
        РЕЖИМ РАЦИОНА. Определяется по бюджету автоматически, но человек
        вправе переопределить: «денег немного, но хочу разнообразия» —
        это его решение, а не наше.
      */}
      <Card className="p-5">
        <h2 className="mb-1 text-base font-bold text-surface-900 dark:text-white">
          Каким должен быть рацион
        </h2>
        <p className="mb-3 text-[12px] leading-snug text-surface-400">
          {state.mode
            ? MODE_HINT[state.mode]
            : 'Подбирается по вашему бюджету. Можно задать вручную'}
        </p>
        <Segmented
          value={state.mode ?? 'auto'}
          onChange={(v) => {
            setMode(v === 'auto' ? null : (v as BudgetMode));
            setTimeout(() => void recalculateMenu(), 30);
          }}
          options={[
            { value: 'auto', label: 'Авто' },
            { value: 'lean', label: MODE_LABEL.lean },
            { value: 'balanced', label: MODE_LABEL.balanced },
            { value: 'premium', label: MODE_LABEL.premium },
          ]}
        />
        {menu?.status === 'optimal' && !state.mode && (
          <p className="mt-2.5 text-[12px] text-surface-500 dark:text-surface-400">
            Сейчас: <b>{MODE_LABEL[menu.mode]}</b> — {MODE_HINT[menu.mode].toLowerCase()}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-bold text-surface-900 dark:text-white">
          Сколько времени на готовку
        </h2>
        <p className="mb-3 text-[12px] leading-snug text-surface-400">
          Приложение подберёт блюда попроще и чаще будет предлагать
          разогреть готовое
        </p>
        <Segmented
          value={state.maxCookingMinutes ?? 0}
          onChange={(v) => {
            update({ maxCookingMinutes: v || undefined });
            setTimeout(() => void recalculateMenu(), 30);
          }}
          options={[
            { value: 60, label: '1 час' },
            { value: 90, label: '1.5 часа' },
            { value: 0, label: 'Не важно' },
          ]}
        />
        {state.maxCookingMinutes === 60 && (
          <p className="mt-2.5 text-[12px] leading-snug text-amber-700 dark:text-amber-400">
            При таком лимите часть приёмов пищи станет проще: бутерброды,
            творог, фрукты. Полноценные горячие блюда требуют времени.
          </p>
        )}
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

      {Object.keys(state.pantry).length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 text-base font-bold text-surface-900 dark:text-white">
            Уже есть дома
          </h2>
          <p className="mb-3 text-[12px] leading-snug text-surface-400">
            Эти продукты вычитаются из списка покупок
          </p>
          <div className="space-y-2">
            {Object.entries(state.pantry).map(([id, grams]) => (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className="text-surface-600 dark:text-surface-300">
                  {PRODUCT_BY_ID[id]?.name ?? id}
                </span>
                <div className="flex items-center gap-2">
                  <span className="tnum font-semibold text-surface-900 dark:text-white">
                    {grams >= 1000 ? `${(grams / 1000).toFixed(1)} кг` : `${Math.round(grams)} г`}
                  </span>
                  <button
                    onClick={() => store.setPantry(id, null)}
                    className="text-xs text-surface-400"
                  >
                    убрать
                  </button>
                </div>
              </div>
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
