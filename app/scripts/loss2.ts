/** Что именно не размещается и почему: 10% потерь — много. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main(){
  const p: Preferences = emptyPreferences();
  for (const id of ['mince','pork','chicken_fillet']) p.products[id]='often';
  p.dishes['coffee_milk']='always';
  for (const [lbl,prefs] of [['без предпочтений',emptyPreferences()],['профиль отзыва',p]] as const) {
    const m = await planMenu({budget:15000,days:30,eaters:[makeEaterLike()],preferences:prefs},RECIPES);
    if (m.status!=='optimal') { console.log(lbl, m.status); continue; }
    const ord = m.demands.reduce((s,d)=>s+d.portions,0);
    const unpl = m.schedule.unplaced.reduce((s,u)=>s+u.portions,0);
    const mins = m.schedule.days.map(d=>d.minutes);
    const kc = m.schedule.days.map(d=>d.nutrients.kcal);
    console.log(`\n${lbl}: заказ ${ord} порций, не влезло ${unpl} (${(unpl/ord*100).toFixed(0)}%)`);
    console.log(`  ккал/д ${(kc.reduce((a,b)=>a+b,0)/30).toFixed(0)} (цель ${(m.target.kcal/30).toFixed(0)}), готовка ${(mins.reduce((a,b)=>a+b,0)/30).toFixed(0)} мин/д макс ${Math.max(...mins)}`);
    console.log(`  свободного времени в днях: ${mins.map(x=>90-x).reduce((a,b)=>a+b,0)} мин всего`);
    console.log('  не влезло:', m.schedule.unplaced.map(u=>`${u.recipe.name}×${u.portions}(${u.recipe.minutes}м)`).join(', ')||'—');
    // пустые приёмы
    let empty=0; for (const d of m.schedule.days) for (const meal of d.meals) if (!meal.dishes.length && meal.slot!=='snack') empty++;
    console.log('  пустых основных приёмов:', empty);
  }
}
