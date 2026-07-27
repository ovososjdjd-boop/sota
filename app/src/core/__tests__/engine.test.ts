import { describe, it, expect } from 'vitest';
import {
  basalMetabolicRate,
  totalEnergyExpenditure,
  dailyTargets,
  periodTargets,
  atwaterDiscrepancy,
} from '../nutrition';
import {
  pickMeasure,
  packsNeeded,
  grossFromNet,
  formatUnits,
  pluralizeMeasureLabel,
} from '../measures';
import { optimizeBasket } from '../optimizer';
import { PRODUCTS, PRODUCT_BY_ID } from '../../data/products';
import type { EaterProfile } from '../types';

const adultMale: EaterProfile = {
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

const adultFemale: EaterProfile = {
  ...adultMale,
  id: '2',
  name: 'Тест-Ж',
  sex: 'female',
  heightCm: 165,
  weightKg: 60,
};

describe('nutrition: расчёт норм', () => {
  it('BMR по Mifflin-St Jeor для мужчины', () => {
    // 10*75 + 6.25*178 - 5*30 + 5 = 750 + 1112.5 - 150 + 5 = 1717.5
    expect(basalMetabolicRate(adultMale)).toBeCloseTo(1717.5, 1);
  });

  it('BMR для женщины ниже при тех же параметрах', () => {
    const sameF = { ...adultMale, sex: 'female' as const };
    expect(basalMetabolicRate(sameF)).toBeLessThan(basalMetabolicRate(adultMale));
    // разница ровно 166 ккал по формуле
    expect(basalMetabolicRate(adultMale) - basalMetabolicRate(sameF)).toBeCloseTo(166, 1);
  });

  it('TDEE попадает в правдоподобный диапазон', () => {
    const tdee = totalEnergyExpenditure(adultMale);
    expect(tdee).toBeGreaterThan(2400);
    expect(tdee).toBeLessThan(3400);
  });

  it('цель «снизить вес» уменьшает калории и повышает белок', () => {
    const maintain = dailyTargets(adultMale);
    const lose = dailyTargets({ ...adultMale, goal: 'lose' });
    expect(lose.kcal.target).toBeLessThan(maintain.kcal.target);
    expect(lose.protein.target).toBeGreaterThan(maintain.protein.target);
  });

  it('белок не опускается ниже физиологического минимума 0.8 г/кг', () => {
    const t = dailyTargets(adultMale);
    // Нижняя граница белка = максимум из физиологического минимума ВОЗ
    // и того, что человек попросил (с допуском 8%). Раньше здесь стоял
    // голый минимум 0.8 г/кг, но тогда просьба «хочу 1.8 г/кг» ничего
    // не гарантировала: солвер видел min 0.8 и экономил на мясе.
    expect(t.protein.min).toBeGreaterThanOrEqual(0.8 * 75);
    expect(t.protein.min).toBeLessThanOrEqual(t.protein.target);
  });

  it('белок настраивается отдельно от калорий', () => {
    const base = dailyTargets(adultMale);
    const highProtein = dailyTargets({ ...adultMale, proteinPerKg: 1.8 });
    // белок вырос
    expect(highProtein.protein.target).toBeCloseTo(1.8 * 75, 1);
    expect(highProtein.protein.target).toBeGreaterThan(base.protein.target);
    // а калории остались теми же — в этом весь смысл параметра
    expect(highProtein.kcal.target).toBeCloseTo(base.kcal.target, 1);
    // энергия перераспределена: углеводов стало меньше
    expect(highProtein.carbs.target).toBeLessThan(base.carbs.target);
  });

  it('запрошенный белок ограничен разумными пределами', () => {
    const tooMuch = dailyTargets({ ...adultMale, proteinPerKg: 9 });
    expect(tooMuch.protein.target).toBeCloseTo(2.2 * 75, 1);
    const tooLittle = dailyTargets({ ...adultMale, proteinPerKg: 0.1 });
    expect(tooLittle.protein.target).toBeCloseTo(0.8 * 75, 1);
  });

  it('цели согласованы по Атуотеру (белки+жиры+углеводы ≈ калории)', () => {
    const t = dailyTargets(adultMale);
    const disc = atwaterDiscrepancy({
      kcal: t.kcal.target,
      protein: t.protein.target,
      fat: t.fat.target,
      carbs: t.carbs.target,
    });
    expect(disc).toBeLessThan(0.02);
  });

  it('цели семьи складываются и масштабируются днями', () => {
    const week = periodTargets([adultMale, adultFemale], 7);
    const day = periodTargets([adultMale, adultFemale], 1);
    expect(week.kcal.target).toBeCloseTo(day.kcal.target * 7, 1);
    expect(week.kcal.target).toBeGreaterThan(dailyTargets(adultMale).kcal.target * 7);
  });
});

describe('measures: домашние меры', () => {
  it('дробные количества выводятся красиво', () => {
    expect(formatUnits(2)).toBe('2');
    expect(formatUnits(0.5)).toBe('½');
    expect(formatUnits(1.5)).toBe('1½');
    expect(formatUnits(2.25)).toBe('2¼');
  });

  it('названия мер склоняются по числу', () => {
    // раньше в интерфейсе выводилось «6 бутылка 450 г»
    expect(pluralizeMeasureLabel('бутылка 450 г', 6)).toBe('бутылок 450 г');
    expect(pluralizeMeasureLabel('стакан (200 мл)', 2)).toBe('стакана (200 мл)');
    expect(pluralizeMeasureLabel('пакет 0.9 л', 3)).toBe('пакета 0.9 л');
    expect(pluralizeMeasureLabel('ломоть', 5)).toBe('ломтей');
    expect(pluralizeMeasureLabel('пачка 200 г', 1)).toBe('пачка 200 г');
    expect(pluralizeMeasureLabel('кусок ≈150 г', 4)).toBe('куска ≈150 г');
    // 11-14 — особый случай русского языка
    expect(pluralizeMeasureLabel('стакан', 11)).toBe('стаканов');
  });

  it('текст меры в плане согласован по числу', () => {
    const milk = PRODUCT_BY_ID['milk'];
    const q = pickMeasure(milk, 412); // ~2 стакана
    expect(q!.text).toMatch(/стакана/);
  });

  it('для яиц подбирается штучная мера, а не граммы', () => {
    const eggs = PRODUCT_BY_ID['eggs'];
    const q = pickMeasure(eggs, 165); // ровно 3 яйца
    expect(q).not.toBeNull();
    expect(q!.measure.kind).toBe('piece');
    expect(q!.units).toBe(3);
    expect(q!.relativeError).toBeLessThan(0.01);
  });

  it('яйца не дробятся пополам', () => {
    const eggs = PRODUCT_BY_ID['eggs'];
    const q = pickMeasure(eggs, 80);
    expect(Number.isInteger(q!.units)).toBe(true);
  });

  it('для крупы подбирается стакан с разумной ошибкой', () => {
    const buckwheat = PRODUCT_BY_ID['buckwheat'];
    const q = pickMeasure(buckwheat, 420); // ~2 стакана по 210 г
    expect(q).not.toBeNull();
    expect(q!.relativeError).toBeLessThan(0.15);
  });

  it('масло отмеряется ложками', () => {
    const oil = PRODUCT_BY_ID['sunflower_oil'];
    const q = pickMeasure(oil, 28);
    expect(q!.measure.kind).toBe('tbsp');
  });

  it('брутто больше нетто при наличии отходов', () => {
    const potato = PRODUCT_BY_ID['potato'];
    const gross = grossFromNet(potato, 1000);
    expect(gross).toBeGreaterThan(1000);
    // 25% отходов → 1000/0.75 ≈ 1333
    expect(gross).toBeCloseTo(1333, 0);
  });

  it('упаковки выбираются с минимальным остатком', () => {
    const buckwheat = PRODUCT_BY_ID['buckwheat'];
    const r = packsNeeded(buckwheat, 850);
    expect(r.totalGrams).toBeGreaterThanOrEqual(850);
    expect(r.leftover).toBeLessThan(r.packSize);
  });
});

describe('data: целостность базы продуктов', () => {
  it('все id уникальны', () => {
    const ids = PRODUCTS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('у всех продуктов положительная цена', () => {
    for (const prod of PRODUCTS) {
      expect(prod.pricePerKg, prod.name).toBeGreaterThan(0);
    }
  });

  it('КБЖУ согласовано по Атуотеру (кроме нулевых)', () => {
    for (const prod of PRODUCTS) {
      if (prod.per100g.kcal === 0) continue;
      const disc = atwaterDiscrepancy(prod.per100g);
      // допускаем 25%: клетчатка, органические кислоты, погрешность справочника
      expect(disc, `${prod.name} (${prod.per100g.kcal} ккал)`).toBeLessThan(0.25);
    }
  });

  it('доля отходов в разумных пределах', () => {
    for (const prod of PRODUCTS) {
      expect(prod.wasteRatio, prod.name).toBeGreaterThanOrEqual(0);
      expect(prod.wasteRatio, prod.name).toBeLessThan(0.6);
    }
  });

  it('у каждого продукта есть источник данных', () => {
    for (const prod of PRODUCTS) {
      expect(prod.source.length, prod.name).toBeGreaterThan(10);
    }
  });

  it('скоропортящиеся имеют короткий срок хранения', () => {
    for (const prod of PRODUCTS.filter((x) => x.perishable)) {
      expect(prod.shelfLifeDays, prod.name).toBeLessThanOrEqual(30);
    }
  });

  it('коэффициенты выхода правдоподобны', () => {
    for (const prod of PRODUCTS) {
      for (const [method, factor] of Object.entries(prod.yields)) {
        expect(factor, `${prod.name}/${method}`).toBeGreaterThan(0.3);
        expect(factor, `${prod.name}/${method}`).toBeLessThan(5);
      }
    }
  });
});

describe('optimizer: планирование корзины', () => {
  it('собирает корзину на неделю для одного человека', async () => {
    const res = await optimizeBasket(
      { budget: 3000, days: 7, eaters: [adultMale] },
      PRODUCTS,
    );
    expect(res.status).toBe('optimal');
    expect(res.items.length).toBeGreaterThan(3);
    expect(res.totalCost).toBeLessThanOrEqual(3000);
  }, 30000);

  it('попадает в целевые калории с приемлемой точностью', async () => {
    const res = await optimizeBasket(
      { budget: 3500, days: 7, eaters: [adultMale] },
      PRODUCTS,
    );
    expect(res.status).toBe('optimal');
    expect(Math.abs(res.deviation.kcal)).toBeLessThan(15);
    expect(Math.abs(res.deviation.protein)).toBeLessThan(30);
  }, 30000);

  it('никогда не превышает бюджет', async () => {
    for (const budget of [1500, 2500, 5000]) {
      const res = await optimizeBasket(
        { budget, days: 7, eaters: [adultMale] },
        PRODUCTS,
      );
      if (res.status === 'optimal') {
        expect(res.totalCost, `бюджет ${budget}`).toBeLessThanOrEqual(budget + 0.01);
      }
    }
  }, 60000);

  it('семья из четырёх стоит дороже одного человека', async () => {
    const family = [
      adultMale,
      adultFemale,
      { ...adultMale, id: '3', age: 10, heightCm: 140, weightKg: 33 },
      { ...adultFemale, id: '4', age: 7, heightCm: 122, weightKg: 24 },
    ];
    const one = await optimizeBasket(
      { budget: 20000, days: 7, eaters: [adultMale] },
      PRODUCTS,
    );
    const four = await optimizeBasket(
      { budget: 20000, days: 7, eaters: family },
      PRODUCTS,
    );
    expect(four.status).toBe('optimal');
    expect(four.totalCost).toBeGreaterThan(one.totalCost);
  }, 60000);

  it('уважает исключённые продукты', async () => {
    const picky = { ...adultMale, excludedProducts: ['potato', 'buckwheat', 'eggs'] };
    const res = await optimizeBasket(
      { budget: 4000, days: 7, eaters: [picky] },
      PRODUCTS,
    );
    expect(res.status).toBe('optimal');
    const ids = res.items.map((x) => x.product.id);
    expect(ids).not.toContain('potato');
    expect(ids).not.toContain('buckwheat');
    expect(ids).not.toContain('eggs');
  }, 30000);

  it('веганский режим не содержит мяса и молочного', async () => {
    const vegan = { ...adultMale, dietTags: ['vegan'] };
    const res = await optimizeBasket(
      { budget: 5000, days: 7, eaters: [vegan] },
      PRODUCTS,
    );
    if (res.status === 'optimal') {
      for (const item of res.items) {
        expect(item.product.tags, item.product.name).toContain('vegan');
      }
    }
  }, 30000);

  it('при нереально малом бюджете сообщает минимум, а не падает', async () => {
    const res = await optimizeBasket(
      { budget: 50, days: 7, eaters: [adultMale] },
      PRODUCTS,
    );
    expect(res.status).toBe('budget_too_low');
    expect(res.explanations.length).toBeGreaterThan(0);
    if (res.minimumFeasibleBudget) {
      expect(res.minimumFeasibleBudget).toBeGreaterThan(50);
    }
  }, 60000);

  it('выдаёт объяснения решений', async () => {
    const res = await optimizeBasket(
      { budget: 3000, days: 7, eaters: [adultMale] },
      PRODUCTS,
    );
    expect(res.explanations.length).toBeGreaterThan(0);
    expect(res.explanations.some((e) => e.kind === 'value')).toBe(true);
  }, 30000);

  it('работает быстро — укладывается в 3 секунды', async () => {
    const res = await optimizeBasket(
      { budget: 3000, days: 14, eaters: [adultMale, adultFemale] },
      PRODUCTS,
    );
    expect(res.solveTimeMs).toBeLessThan(3000);
  }, 30000);

  it('длинный период даёт большую корзину', async () => {
    const week = await optimizeBasket(
      { budget: 10000, days: 7, eaters: [adultMale] },
      PRODUCTS,
    );
    const month = await optimizeBasket(
      { budget: 10000, days: 30, eaters: [adultMale] },
      PRODUCTS,
    );
    expect(month.totalCost).toBeGreaterThan(week.totalCost);
  }, 60000);
});
