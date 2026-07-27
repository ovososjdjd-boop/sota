/** Проверка волн закупки: суммы, сроки, переплата. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { planWaves, riskyLines } from '../src/core/waves';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
import { mass } from '../src/core/format';

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  const m = await planMenu({ budget: 15000, days: 30, eaters: [makeEaterLike()], preferences: prefs }, RECIPES);
  if (m.status !== 'optimal') return console.log(m.status);

  const waves = planWaves(m.schedule);
  let total = 0;
  for (const w of waves) {
    total += w.cost;
    console.log(`\n── Волна ${w.index + 1}: день ${w.dayIndex + 1}, покрывает ${w.coversDays} дн — ${Math.round(w.cost)} ₽, позиций ${w.lines.length}`);
    for (const l of w.lines.slice(0, 6)) {
      console.log(`   ${l.product.name.padEnd(30)} ${l.packs}×${mass(l.packSize)} = ${mass(l.buyGrams)}  ${Math.round(l.cost)} ₽  срок ${l.product.shelfLifeDays}д${l.fitsShelfLife ? '' : ' ← НЕ ДОЖИВЁТ'}`);
    }
    const risky = riskyLines(w);
    if (risky.length) console.log(`   рискованных позиций: ${risky.length} (${risky.map(x=>x.product.name).join(', ')})`);
  }
  console.log(`\nИТОГО по волнам ${Math.round(total)} ₽ против единого списка ${Math.round(m.purchaseCost)} ₽`);
  const maxWave = Math.max(...waves.map(w => w.cost));
  console.log(`самая дорогая волна: ${Math.round(maxWave)} ₽ (единовременно нести)`);
}
