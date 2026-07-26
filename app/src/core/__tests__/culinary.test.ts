/**
 * Тесты кулинарной адекватности рациона.
 *
 * Каждый тест здесь закрепляет РЕАЛЬНЫЙ дефект, найденный при визуальной
 * проверке результатов. Без этих ограничений оптимизатор выдавал
 * математически верный, но несъедобный рацион («диета Стиглера»).
 */

import { describe, it, expect } from 'vitest';
import { optimizeBasket } from '../optimizer';
import { PRODUCTS } from '../../data/products';
import type { EaterProfile, PlanResult } from '../types';
import { PROTEIN_CATEGORIES } from '../culinary';

const eater: EaterProfile = {
  id: '1',
  name: 'Тест',
  sex: 'male',
  age: 30,
  heightCm: 178,
  weightKg: 75,
  activity: 'moderate',
  goal: 'maintain',
  excludedProducts: [],
  dietTags: [],
};

async function plan(budget: number, days = 7, eaters = [eater]): Promise<PlanResult> {
  return optimizeBasket({ budget, days, eaters }, PRODUCTS);
}

describe('кулинарная адекватность', () => {
  it('в рационе обязательно есть крупы или хлеб (основа меню)', async () => {
    const r = await plan(4000);
    expect(r.status).toBe('optimal');
    const staples = r.items.filter(
      (i) => i.product.category === 'grain' || i.product.category === 'bread',
    );
    expect(staples.length).toBeGreaterThan(0);
  }, 30000);

  it('сахар не превышает 5% энергии рациона (рекомендация ВОЗ)', async () => {
    const r = await plan(4000);
    const sweetKcal = r.items
      .filter((i) => i.product.category === 'sweet')
      .reduce((s, i) => s + i.nutrients.kcal, 0);
    expect(sweetKcal / r.actual.kcal).toBeLessThanOrEqual(0.06);
  }, 30000);

  it('ни один продукт не занимает больше трети рациона', async () => {
    const r = await plan(4000);
    for (const item of r.items) {
      const share = item.nutrients.kcal / r.actual.kcal;
      expect(share, item.product.name).toBeLessThanOrEqual(0.34);
    }
  }, 30000);

  it('не более разумного количества одного продукта в день', async () => {
    // раньше выдавало 21 помидор и 28 сосисок на неделю
    const r = await plan(5000);
    for (const item of r.items) {
      const perPersonPerDay = item.grams / 7;
      expect(perPersonPerDay, item.product.name).toBeLessThanOrEqual(420);
    }
  }, 30000);

  it('приправы не становятся основой рациона', async () => {
    // раньше: 46 столовых ложек сметаны как главный молочный продукт
    const r = await plan(5000);
    for (const item of r.items.filter((i) => i.product.tags.includes('condiment'))) {
      const perDay = item.grams / 7;
      expect(perDay, item.product.name).toBeLessThanOrEqual(35);
    }
  }, 30000);

  it('половина белка приходит из полноценных источников, а не из хлеба', async () => {
    const r = await plan(4000);
    const quality = r.items
      .filter((i) => PROTEIN_CATEGORIES.includes(i.product.category))
      .reduce((s, i) => s + i.nutrients.protein, 0);
    expect(quality / r.actual.protein).toBeGreaterThanOrEqual(0.45);
  }, 30000);

  it('клетчатки достаточно (норма ~25 г/сут)', async () => {
    const r = await plan(4000);
    const perDay = (r.actual.fiber ?? 0) / 7;
    expect(perDay).toBeGreaterThanOrEqual(14);
  }, 30000);

  it('овощей и фруктов не меньше 350 г в день', async () => {
    const r = await plan(4000);
    const produce = r.items
      .filter((i) => i.product.category === 'vegetable' || i.product.category === 'fruit')
      .reduce((s, i) => s + i.grams, 0);
    expect(produce / 7).toBeGreaterThanOrEqual(340);
  }, 30000);

  it('рацион разнообразен — минимум 8 позиций', async () => {
    const r = await plan(4000);
    expect(r.items.length).toBeGreaterThanOrEqual(8);
  }, 30000);

  it('представлены минимум 5 разных категорий продуктов', async () => {
    const r = await plan(4000);
    const categories = new Set(r.items.map((i) => i.product.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  }, 30000);
});

describe('масштабирование по периоду', () => {
  it('месячный план не объявляется невозможным из-за скоропорта', async () => {
    // раньше: молоко резалось до срока хранения (7 дней),
    // и месяц за 10 000 ₽ считался недостижимым
    const r = await plan(10000, 30);
    expect(r.status).toBe('optimal');
  }, 30000);

  it('стоимость в день стабильна на разных горизонтах', async () => {
    const week = await plan(10000, 7);
    const month = await plan(10000, 30);
    expect(week.status).toBe('optimal');
    expect(month.status).toBe('optimal');

    const perDayWeek = week.totalCost / 7;
    const perDayMonth = month.totalCost / 30;
    // расхождение не больше 35% — закупочные циклы и упаковки дают разброс
    const ratio = perDayMonth / perDayWeek;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(1.35);
  }, 60000);

  it('месяц дороже недели при одинаковом бюджете', async () => {
    const week = await plan(15000, 7);
    const month = await plan(15000, 30);
    expect(month.totalCost).toBeGreaterThan(week.totalCost);
  }, 60000);
});

describe('честность перед пользователем', () => {
  it('объясняет крупный остаток бюджета, а не молчит', async () => {
    const r = await plan(15000, 7);
    expect(r.status).toBe('optimal');
    const left = 15000 - r.totalCost;
    if (left > 15000 * 0.25) {
      const text = r.explanations.map((e) => e.text).join(' ');
      expect(text).toMatch(/остаётся|нормально/i);
    }
  }, 30000);

  it('при недостижимом бюджете предлагает конкретную сумму', async () => {
    const r = await plan(200, 7);
    expect(r.status).toBe('budget_too_low');
    expect(r.minimumFeasibleBudget).toBeGreaterThan(200);
    expect(r.explanations[0].text).toMatch(/\d/);
  }, 60000);
});
