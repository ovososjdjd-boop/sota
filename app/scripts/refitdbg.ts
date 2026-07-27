import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often'; prefs.products['pork'] = 'often';
  prefs.products['chicken_fillet'] = 'often'; prefs.dishes['coffee_milk'] = 'always';
  for (const lim of [undefined, 60]) {
    const m = await planMenu({ budget: 15000, days: 30, eaters: [makeEaterLike()], preferences: prefs, maxCookingMinutes: lim }, RECIPES);
    if (m.status !== 'optimal') { console.log(m.status); continue; }
    const un = m.schedule.unplaced.reduce((s,x)=>s+x.portions,0);
    const ord = m.demands.reduce((s,d)=>s+d.portions,0);
    console.log(`лимит ${lim ?? '—'}: заказано ${ord}, не размещено ${un} (${(un/ord*100).toFixed(0)}%), ккал/д ${(m.actual.kcal/30).toFixed(0)}`);
  }
}
