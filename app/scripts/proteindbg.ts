/**
 * Почему белок не растёт при любом бюджете.
 *
 * Кандидаты на виновника:
 *   а) верхняя граница белка в целевой функции (band «не больше нормы»)
 *   б) баланс нутриентов тянет строго к target, а не «не меньше»
 *   в) потолки категорий
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { periodTargets, dailyTargets } from '../src/core/nutrition';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const eater = makeEaterLike();
  const t = dailyTargets(eater);
  console.log(
    `цели/сут: ккал ${t.kcal.target.toFixed(0)} [${t.kcal.min.toFixed(0)}..${t.kcal.max.toFixed(0)}]  ` +
      `белок ${t.protein.target.toFixed(0)} [${t.protein.min.toFixed(0)}..${t.protein.max.toFixed(0)}]`,
  );
  console.log(
    `  то есть белок ${(t.protein.target / 82).toFixed(2)} г/кг, максимум ${(t.protein.max / 82).toFixed(2)} г/кг`,
  );

  const prefs: Preferences = emptyPreferences();
  const m = await planMenu(
    { budget: 25000, days: 30, eaters: [eater], preferences: prefs },
    RECIPES,
  );
  if (m.status !== 'optimal') return console.log(m.status);
  const pt = periodTargets([eater], 30);
  console.log(
    `факт за период: белок ${m.actual.protein.toFixed(0)} при target ${pt.protein.target.toFixed(0)}, ` +
      `max ${pt.protein.max.toFixed(0)} — использовано ${((m.actual.protein / pt.protein.max) * 100).toFixed(0)}% от максимума`,
  );
  console.log(
    `ккал ${m.actual.kcal.toFixed(0)} при target ${pt.kcal.target.toFixed(0)}, max ${pt.kcal.max.toFixed(0)}`,
  );
}
