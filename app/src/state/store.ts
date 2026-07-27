/**
 * Состояние приложения. Без внешних библиотек — обычный React-хук
 * с сохранением в localStorage. Всё локально, ничего не уходит в сеть.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EaterProfile, PlanResult, Product } from '../core/types';
import { PRODUCTS } from '../data/products';
import { optimizeBasket } from '../core/optimizer';
import { planMenu, type MenuResult } from '../core/menuPlanner';
import { applySwap, recalcProducts, scheduleCost } from '../core/swap';
import { emptyPreferences, type Liking, type Preferences } from '../core/preferences';
import { DEFAULT_EQUIPMENT, type Equipment } from '../core/equipment';
import type { BudgetMode } from '../core/tiers';
import type { RecipeStats } from '../core/recipes';
import { RECIPES } from '../data/recipes';

const STORAGE_KEY = 'ration.state.v1';

export interface AppState {
  budget: number;
  days: number;
  eaters: EaterProfile[];
  /** Переопределённые пользователем цены: productId → ₽/кг */
  priceOverrides: Record<string, number>;
  /** Продукты, исключённые глобально */
  excluded: string[];
  /** Что уже есть дома: productId → граммы. Вычитается из списка покупок */
  pantry: Record<string, number>;
  /** Что человек любит и что не хочет видеть в меню */
  preferences: Preferences;
  onboarded: boolean;
  theme: 'light' | 'dark';
  /** Максимум времени готовки в день, мин. 0 — без ограничения */
  maxCookingMinutes?: number;
  /** Что есть на кухне: блюда, которые нечем приготовить, не предлагаются */
  equipment: Equipment[];
  /**
   * Режим рациона. undefined — определяется автоматически по бюджету.
   * Пользователь вправе переопределить: «денег немного, но хочу
   * разнообразия» — его решение, а не наше.
   */
  mode?: BudgetMode;
}

export function makeEater(partial: Partial<EaterProfile> = {}): EaterProfile {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: 'Взрослый',
    sex: 'male',
    age: 30,
    heightCm: 175,
    weightKg: 70,
    activity: 'moderate',
    goal: 'maintain',
    excludedProducts: [],
    dietTags: [],
    ...partial,
  };
}

const DEFAULT_STATE: AppState = {
  budget: 5000,
  days: 7,
  eaters: [makeEater({ name: 'Я' })],
  priceOverrides: {},
  excluded: [],
  pantry: {},
  preferences: emptyPreferences(),
  equipment: DEFAULT_EQUIPMENT,
  onboarded: false,
  theme: 'light',
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      // структура предпочтений могла отсутствовать в старом сохранении
      preferences: {
        dishes: parsed.preferences?.dishes ?? {},
        products: parsed.preferences?.products ?? {},
      },
      // в старых сохранениях поля не было
      equipment: parsed.equipment ?? DEFAULT_EQUIPMENT,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function save(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // приватный режим — молча продолжаем
  }
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [menu, setMenu] = useState<MenuResult | null>(null);
  const [calculatingMenu, setCalculatingMenu] = useState(false);

  useEffect(() => {
    save(state);
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [state.theme]);

  /** Продукты с учётом пользовательских цен и исключений. */
  const products: Product[] = useMemo(() => {
    return PRODUCTS.filter((p) => !state.excluded.includes(p.id)).map((p) => {
      const override = state.priceOverrides[p.id];
      return override != null && override > 0 ? { ...p, pricePerKg: override } : p;
    });
  }, [state.priceOverrides, state.excluded]);

  const recalculate = useCallback(async () => {
    setCalculating(true);
    try {
      const result = await optimizeBasket(
        { budget: state.budget, days: state.days, eaters: state.eaters },
        products,
      );
      setPlan(result);
    } finally {
      setCalculating(false);
    }
  }, [state.budget, state.days, state.eaters, products]);

  /** Построение меню по дням (Этап 4). */
  const recalculateMenu = useCallback(async () => {
    setCalculatingMenu(true);
    try {
      const result = await planMenu(
        {
          budget: state.budget,
          days: state.days,
          eaters: state.eaters,
          preferences: state.preferences,
          maxCookingMinutes: state.maxCookingMinutes,
          equipment: state.equipment,
          mode: state.mode,
        },
        RECIPES,
        undefined,
        new Set(state.excluded),
      );
      setMenu(result);
    } finally {
      setCalculatingMenu(false);
    }
  }, [
    state.budget,
    state.days,
    state.eaters,
    state.excluded,
    state.preferences,
    state.maxCookingMinutes,
    state.equipment,
    state.mode,
  ]);

  /**
   * Замена блюда в меню. Пересчитываем только затронутое —
   * полный перезапуск оптимизатора здесь не нужен и был бы медленным.
   */
  const swapDish = useCallback(
    (dayIndex: number, slot: string, fromRecipeId: string, to: RecipeStats) => {
      setMenu((prev) => {
        if (!prev || prev.status !== 'optimal') return prev;
        const schedule = applySwap(prev.schedule, dayIndex, slot, fromRecipeId, to);
        const products = recalcProducts(schedule);
        const totalCost = scheduleCost(schedule);

        const actual = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
        for (const day of schedule.days) {
          actual.kcal += day.nutrients.kcal;
          actual.protein += day.nutrients.protein;
          actual.fat += day.nutrients.fat;
          actual.carbs += day.nutrients.carbs;
          actual.fiber += day.nutrients.fiber ?? 0;
        }

        return { ...prev, schedule, products, totalCost, actual };
      });
    },
    [],
  );

  const update = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch }));
    // меню зависит от бюджета и состава семьи — сбрасываем кэш
    setMenu(null);
  }, []);

  const setEater = useCallback((id: string, patch: Partial<EaterProfile>) => {
    setState((s) => ({
      ...s,
      eaters: s.eaters.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
    setMenu(null);
  }, []);

  const addEater = useCallback(() => {
    setState((s) => ({ ...s, eaters: [...s.eaters, makeEater({ name: 'Ещё один' })] }));
    setMenu(null);
  }, []);

  const removeEater = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      eaters: s.eaters.length > 1 ? s.eaters.filter((e) => e.id !== id) : s.eaters,
    }));
  }, []);

  const setPrice = useCallback((productId: string, price: number | null) => {
    setState((s) => {
      const next = { ...s.priceOverrides };
      if (price == null) delete next[productId];
      else next[productId] = price;
      return { ...s, priceOverrides: next };
    });
  }, []);

  /** Отношение к продукту: люблю / редко / не предлагать. */
  const setProductLiking = useCallback((productId: string, liking: Liking | null) => {
    setState((s) => {
      const next = { ...s.preferences.products };
      if (liking == null) delete next[productId];
      else next[productId] = liking;
      return { ...s, preferences: { ...s.preferences, products: next } };
    });
    setMenu(null);
  }, []);

  /** Отношение к блюду, в том числе «каждый день». */
  const setDishLiking = useCallback((recipeId: string, liking: Liking | null) => {
    setState((s) => {
      const next = { ...s.preferences.dishes };
      if (liking == null) delete next[recipeId];
      else next[recipeId] = liking;
      return { ...s, preferences: { ...s.preferences, dishes: next } };
    });
    setMenu(null);
  }, []);

  /** Указать, сколько продукта уже есть дома. */
  const setPantry = useCallback((productId: string, grams: number | null) => {
    setState((s) => {
      const next = { ...s.pantry };
      if (grams == null || grams <= 0) delete next[productId];
      else next[productId] = grams;
      return { ...s, pantry: next };
    });
  }, []);

  const toggleExcluded = useCallback((productId: string) => {
    setState((s) => ({
      ...s,
      excluded: s.excluded.includes(productId)
        ? s.excluded.filter((x) => x !== productId)
        : [...s.excluded, productId],
    }));
    setMenu(null);
  }, []);

  /** Есть ли на кухне такая техника. */
  const toggleEquipment = useCallback((item: Equipment) => {
    setState((s) => ({
      ...s,
      equipment: s.equipment.includes(item)
        ? s.equipment.filter((x) => x !== item)
        : [...s.equipment, item],
    }));
    setMenu(null);
  }, []);

  /** Режим рациона; null — вернуть автоопределение по бюджету. */
  const setMode = useCallback((mode: BudgetMode | null) => {
    setState((s) => ({ ...s, mode: mode ?? undefined }));
    setMenu(null);
  }, []);

  const toggleTheme = useCallback(() => {
    setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
    setPlan(null);
    setMenu(null);
  }, []);

  return {
    state,
    plan,
    calculating,
    menu,
    calculatingMenu,
    recalculateMenu,
    swapDish,
    products,
    update,
    setEater,
    addEater,
    removeEater,
    setPrice,
    setPantry,
    setProductLiking,
    setDishLiking,
    toggleExcluded,
    toggleEquipment,
    setMode,
    toggleTheme,
    recalculate,
    reset,
  };
}

export type Store = ReturnType<typeof useAppState>;
