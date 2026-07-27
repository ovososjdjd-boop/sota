/** Подбор разумного лимита по умолчанию: где норма ещё держится. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  for (const lim of [60, 75, 90, 105, 0]) {
    const rows: string[] = [];
    for (const [days,budget] of [[7,5000],[30,15000]] as [number,number][]) {
      const m = await planMenu({budget,days,eaters:[makeEaterLike()],preferences:emptyPreferences(),maxCookingMinutes:lim},RECIPES);
      if (m.status!=='optimal'){rows.push(`${days}д:${m.status}`);continue;}
      const per = m.schedule.days.map(d=>d.minutes);
      const avg = per.reduce((a,b)=>a+b,0)/days;
      rows.push(`${days}д: ${(m.actual.kcal/days).toFixed(0)}ккал ${avg.toFixed(0)}мин макс${Math.max(...per)}`);
    }
    console.log(`лимит ${String(lim||'—').padStart(3)}: ${rows.join('   ')}`);
  }
}
