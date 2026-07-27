/**
 * Проверка подозрений, замеченных при чтении меню глазами:
 *  1) одно и то же блюдо дважды за день (дни 7, 19, 24);
 *  2) недобор калорий: дни по 1724-2077 при цели 2506;
 *  3) сколько дней подряд повторяется завтрак.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import type { EaterProfile } from '../src/core/types';

const me: EaterProfile = {
  id: 'me', name: 'Я', sex: 'male', age: 32, heightCm: 180, weightKg: 82,
  activity: 'sedentary', goal: 'maintain', proteinPerKg: 1.8,
  excludedProducts: [], dietTags: [],
};
function myPreferences(): Preferences {
  const p = emptyPreferences();
  p.products['mince'] = 'often';
  p.products['mince_chicken'] = 'often';
  p.products['pork'] = 'often';
  p.products['chicken_fillet'] = 'often';
  p.products['beef'] = 'often';
  p.products['greens'] = 'never';
  p.dishes['coffee_milk'] = 'always';
  return p;
}

export default async function main() {
  const menu = await planMenu(
    { budget: 15000, days: 30, eaters: [me], preferences: myPreferences() },
    RECIPES,
  );
  if (menu.status !== 'optimal') return console.log(menu.status);

  // 1) дубли внутри дня
  console.log('ОДНО БЛЮДО ДВАЖДЫ ЗА ДЕНЬ');
  let dупес = 0;
  for (const d of menu.schedule.days) {
    const count = new Map<string, string[]>();
    for (const meal of d.meals)
      for (const dish of meal.dishes) {
        const l = count.get(dish.recipe.name) ?? [];
        l.push(meal.slot);
        count.set(dish.recipe.name, l);
      }
    for (const [name, slots] of count) {
      if (slots.length > 1) {
        console.log(`   день ${d.index + 1}: «${name}» в ${slots.join(' и ')}`);
        dупес++;
      }
    }
  }
  if (dупес === 0) console.log('   нет');

  // 2) распределение калорий по дням
  const kcals = menu.schedule.days.map((d) => Math.round(d.nutrients.kcal));
  const target = Math.round(menu.target.kcal / 30);
  const low = kcals.filter((k) => k < target * 0.85).length;
  const high = kcals.filter((k) => k > target * 1.15).length;
  console.log(`\nКАЛОРИИ ПО ДНЯМ (цель ${target})`);
  console.log(`   ${kcals.join(' ')}`);
  console.log(
    `   дней ниже -15%: ${low}, выше +15%: ${high}, ` +
      `минимум ${Math.min(...kcals)}, максимум ${Math.max(...kcals)}`,
  );

  // 3) повтор завтрака подряд
  console.log('\nЗАВТРАКИ ПОДРЯД');
  const brk = menu.schedule.days.map(
    (d) => d.meals.find((m) => m.slot === 'breakfast')?.dishes.map((x) => x.recipe.name).join(' + ') ?? '—',
  );
  let run = 1;
  for (let i = 1; i < brk.length; i++) {
    const same = brk[i].split(' + ')[0] === brk[i - 1].split(' + ')[0];
    if (same) run++;
    else {
      if (run >= 3) console.log(`   дни ${i - run + 1}-${i}: «${brk[i - 1].split(' + ')[0]}» ${run} раза подряд`);
      run = 1;
    }
  }
  console.log('   первые 10 завтраков:');
  brk.slice(0, 10).forEach((b, i) => console.log(`     день ${i + 1}: ${b}`));

  // 4) сколько порций пропало
  const unpl = menu.schedule.unplaced.reduce((s, u) => s + u.portions, 0);
  const ord = menu.demands.reduce((s, d) => s + d.portions, 0);
  console.log(`\nНЕ РАЗМЕЩЕНО: ${unpl} из ${ord} порций (${((unpl / ord) * 100).toFixed(0)}%)`);
}
