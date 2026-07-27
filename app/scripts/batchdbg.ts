/**
 * Работает ли batch cooking на самом деле.
 *
 * Подозрение: правило неповторения (не подавать блюдо чаще раза
 * в 3-5 дней) и разогрев готового (keepsDays 1-3 дня) противоречат
 * друг другу. Если блюдо нельзя подать раньше чем через 3 дня,
 * а хранится оно 2 дня — разогревать нечего, всё готовится заново.
 * Тогда «сварил кастрюлю супа на три дня» в модели не существует,
 * и время готовки завышено в разы.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';
  prefs.dishes['coffee_milk'] = 'always';

  const m = await planMenu(
    { budget: 15000, days: 30, eaters: [makeEaterLike()], preferences: prefs },
    RECIPES,
  );
  if (m.status !== 'optimal') return console.log(m.status);

  let cooked = 0;
  let reheated = 0;
  for (const d of m.schedule.days)
    for (const meal of d.meals)
      for (const dish of meal.dishes) {
        if (dish.cooked) cooked++;
        else reheated++;
      }
  console.log(
    `подач всего ${cooked + reheated}: готовится заново ${cooked}, разогревается ${reheated} ` +
      `(${((reheated / (cooked + reheated)) * 100).toFixed(0)}%)`,
  );

  // распределение keepsDays по блюдам, попавшим в меню
  const keeps = new Map<number, number>();
  for (const d of m.demands) {
    const k = d.stats.recipe.keepsDays;
    keeps.set(k, (keeps.get(k) ?? 0) + 1);
  }
  console.log(
    'keepsDays у блюд меню: ' +
      [...keeps.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}дн:${v}`).join(' '),
  );

  // batchPortions: на сколько порций готовят за раз
  const batch = new Map<number, number>();
  for (const d of m.demands) {
    const b = d.stats.recipe.batchPortions;
    batch.set(b, (batch.get(b) ?? 0) + 1);
  }
  console.log(
    'batchPortions: ' +
      [...batch.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}порц:${v}`).join(' '),
  );

  // сколько раз одно и то же блюдо шло в соседние дни
  const daysOf = new Map<string, number[]>();
  for (const d of m.schedule.days)
    for (const meal of d.meals)
      for (const dish of meal.dishes) {
        const l = daysOf.get(dish.recipe.id) ?? [];
        l.push(d.index);
        daysOf.set(dish.recipe.id, l);
      }
  let adjacent = 0;
  for (const l of daysOf.values()) {
    const s = [...new Set(l)].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] === 1) adjacent++;
  }
  console.log(`подач в соседние дни (доедание): ${adjacent}`);
}
