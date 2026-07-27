import { RECIPES } from '../src/data/recipes';
import { computeRecipeStats } from '../src/core/recipes';
export default function () {
  const rows = RECIPES.map(r => { const s = computeRecipeStats(r); return { n: r.name, c: s.cost, k: s.nutrients.kcal, per100: s.cost/(s.nutrients.kcal/100) }; })
    .sort((a,b)=>b.c-a.c);
  console.log('— самые дорогие порции —');
  for (const r of rows.slice(0,10)) console.log(`${r.c.toFixed(0).padStart(4)} ₽  ${r.n.padEnd(32)} ${r.k.toFixed(0)} ккал  ${r.per100.toFixed(0)} ₽/100ккал`);
  const cs = rows.map(r=>r.c).sort((a,b)=>a-b);
  console.log(`медиана ${cs[Math.floor(cs.length/2)].toFixed(0)} ₽, среднее ${(cs.reduce((a,b)=>a+b,0)/cs.length).toFixed(0)} ₽`);
  console.log('— худшие по цене за 100 ккал —');
  for (const r of [...rows].sort((a,b)=>b.per100-a.per100).slice(0,6)) console.log(`${r.per100.toFixed(0).padStart(4)} ₽/100ккал  ${r.n}`);
}
