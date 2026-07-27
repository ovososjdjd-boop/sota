/**
 * ГИПОТЕЗА О КОРНЕ: режим влияет на КЛАСС продукта (treat/essential),
 * но не на СТРУКТУРУ рациона (сколько мяса, сколько круп).
 *
 * Симптом: при 35 000 ₽ в месяц человек получает крупы 30.6% (потолок
 * 33%), мясо 5.5% (минимум 5%) — то есть тарелку бедняка с щепоткой
 * деликатесов сверху. Отсюда и низкий чек: крупы стоят 118 ₽
 * за 1000 ккал, а мясо — 400.
 *
 * Проверяем: если поднять минимум мяса/рыбы и опустить потолок круп
 * для богатого режима — вырастет ли чек и структура?
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { CATEGORY_RULES } from '../src/core/culinary';
import { emptyPreferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';

const e: EaterProfile = {
  id: 'u', name: 'Т', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', excludedProducts: [], dietTags: [],
};

async function run(label: string, budget: number) {
  const t0 = Date.now();
  const m = await planMenu(
    { budget, days: 30, eaters: [e], preferences: emptyPreferences() },
    RECIPES,
  );
  if (m.status !== 'optimal') {
    console.log(`${label}: ${m.status}`);
    return;
  }
  const byCat = new Map<string, number>();
  let tot = 0;
  for (const d of m.demands)
    for (const [c, k] of Object.entries(d.stats.categoryKcal)) {
      byCat.set(c, (byCat.get(c) ?? 0) + (k as number) * d.portions);
      tot += (k as number) * d.portions;
    }
  const pct = (c: string) => (((byCat.get(c) ?? 0) / tot) * 100).toFixed(1).padStart(4);
  console.log(
    `${label.padEnd(24)} чек ${String(Math.round(m.purchaseCost)).padStart(5)} ` +
      `(${String(Math.round((m.purchaseCost / budget) * 100)).padStart(3)}%) ` +
      `белок ${(m.actual.protein / 30 / 82).toFixed(2)} ккал/д ${(m.actual.kcal / 30).toFixed(0)} | ` +
      `мясо ${pct('meat')} рыба ${pct('fish')} молоч ${pct('dairy')} крупы ${pct('grain')} ` +
      `овощи ${pct('vegetable')} жиры ${pct('fat')} | ${Date.now() - t0} мс`,
  );
}

export default async function main() {
  console.log('— как есть —');
  for (const b of [11000, 18000, 35000]) await run(`${b} ₽`, b);

  // грубый хак: временно правим CATEGORY_RULES под «богатую» структуру
  const grain = { ...CATEGORY_RULES.grain! };
  const meat = { ...CATEGORY_RULES.meat! };
  const fish = { ...CATEGORY_RULES.fish! };
  CATEGORY_RULES.grain!.maxEnergyShare = 0.22;
  CATEGORY_RULES.meat!.minEnergyShare = 0.12;
  CATEGORY_RULES.fish!.minEnergyShare = 0.05;

  console.log('\n— крупы ≤22%, мясо ≥12%, рыба ≥5% —');
  for (const b of [11000, 18000, 35000]) await run(`${b} ₽`, b);

  Object.assign(CATEGORY_RULES.grain!, grain);
  Object.assign(CATEGORY_RULES.meat!, meat);
  Object.assign(CATEGORY_RULES.fish!, fish);

  CATEGORY_RULES.grain!.maxEnergyShare = 0.27;
  CATEGORY_RULES.meat!.minEnergyShare = 0.09;
  CATEGORY_RULES.fish!.minEnergyShare = 0.035;
  console.log('\n— крупы ≤27%, мясо ≥9%, рыба ≥3.5% —');
  for (const b of [11000, 18000, 35000]) await run(`${b} ₽`, b);
  Object.assign(CATEGORY_RULES.grain!, grain);
  Object.assign(CATEGORY_RULES.meat!, meat);
  Object.assign(CATEGORY_RULES.fish!, fish);
}
