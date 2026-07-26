/**
 * Состояние приложения. Без внешних библиотек — обычный React-хук
 * с сохранением в localStorage. Всё локально, ничего не уходит в сеть.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EaterProfile, PlanResult, Product } from '../core/types';
import { PRODUCTS } from '../data/products';
import { optimizeBasket } from '../core/optimizer';

const STORAGE_KEY = 'ration.state.v1';

export interface AppState {
  budget: number;
  days: number;
  eaters: EaterProfile[];
  /** Переопределённые пользователем цены: productId → ₽/кг */
  priceOverrides: Record<string, number>;
  /** Продукты, исключённые глобально */
  excluded: string[];
  onboarded: boolean;
  theme: 'light' | 'dark';
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
  onboarded: false,
  theme: 'light',
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...DEFAULT_STATE, ...parsed };
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

  const update = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const setEater = useCallback((id: string, patch: Partial<EaterProfile>) => {
    setState((s) => ({
      ...s,
      eaters: s.eaters.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, []);

  const addEater = useCallback(() => {
    setState((s) => ({ ...s, eaters: [...s.eaters, makeEater({ name: 'Ещё один' })] }));
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

  const toggleExcluded = useCallback((productId: string) => {
    setState((s) => ({
      ...s,
      excluded: s.excluded.includes(productId)
        ? s.excluded.filter((x) => x !== productId)
        : [...s.excluded, productId],
    }));
  }, []);

  const toggleTheme = useCallback(() => {
    setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
    setPlan(null);
  }, []);

  return {
    state,
    plan,
    calculating,
    products,
    update,
    setEater,
    addEater,
    removeEater,
    setPrice,
    toggleExcluded,
    toggleTheme,
    recalculate,
    reset,
  };
}

export type Store = ReturnType<typeof useAppState>;
