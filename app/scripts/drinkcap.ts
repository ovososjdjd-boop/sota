/** Гипотеза: привычка «кофе каждый день» съедает всю вместимость группы drink. */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main(){
  for (const withCoffee of [false, true]) {
    const p: Preferences = emptyPreferences();
    for (const id of ['mince','pork','chicken_fillet']) p.products[id]='often';
    if (withCoffee) p.dishes['coffee_milk']='always';
    const m = await planMenu({budget:15000,days:30,eaters:[makeEaterLike()],preferences:p},RECIPES);
    if (m.status!=='optimal') { console.log(withCoffee, m.status); continue; }
    const drinks = m.demands.filter(d=>d.stats.recipe.role==='drink');
    const ordered = drinks.reduce((s,d)=>s+d.portions,0);
    const unpl = m.schedule.unplaced.filter(u=>u.recipe.role==='drink').reduce((s,u)=>s+u.portions,0);
    const totUnpl = m.schedule.unplaced.reduce((s,u)=>s+u.portions,0);
    console.log(`\nкофе-привычка: ${withCoffee?'ДА':'нет'}`);
    console.log(`  напитков заказано ${ordered}, не влезло ${unpl}; всего потерь ${totUnpl}`);
    console.log(`  ${drinks.map(d=>`${d.stats.recipe.name}×${d.portions}[${d.stats.recipe.slots.join('/')}]`).join(', ')}`);
    console.log(`  ккал/д ${(m.schedule.days.reduce((s,d)=>s+d.nutrients.kcal,0)/30).toFixed(0)}`);
  }
}
