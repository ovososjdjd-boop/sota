/**
 * Хватает ли ЗАКАЗА, чтобы наполнить перекусы?
 * Перекус = 15% энергии = 376 ккал/день = 11 280 ккал за месяц.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main(){
  for (const [lbl, mk] of [['без предпочтений', ()=>emptyPreferences()],
    ['профиль отзыва', ()=>{const p=emptyPreferences();
      for (const id of ['mince','pork','chicken_fillet']) p.products[id]='often';
      p.dishes['coffee_milk']='always'; return p;}]] as const) {
    const m = await planMenu({budget:15000,days:30,eaters:[makeEaterLike()],preferences:mk()},RECIPES);
    if (m.status!=='optimal') { console.log(lbl,m.status); continue; }
    // энергия заказа, доступная перекусу (блюда со слотом snack)
    let snackKcal=0, snackOnlyKcal=0;
    for (const d of m.demands) {
      const k = d.stats.nutrients.kcal*d.portions;
      if (d.stats.recipe.slots.includes('snack')) {
        snackKcal += k;
        if (d.stats.recipe.slots.length===1) snackOnlyKcal += k;
      }
    }
    const need = m.target.kcal*0.15;
    // сколько реально легло
    let placed=0; for (const day of m.schedule.days) for (const meal of day.meals)
      if (meal.slot==='snack') placed += meal.nutrients.kcal;
    console.log(`\n${lbl}:`);
    console.log(`  перекусу нужно ${need.toFixed(0)} ккал за месяц, легло ${placed.toFixed(0)} (${(placed/need*100).toFixed(0)}%)`);
    console.log(`  в заказе блюд со слотом snack на ${snackKcal.toFixed(0)} ккал (из них только-перекус ${snackOnlyKcal.toFixed(0)})`);
    console.log(`  всего заказ ${m.demands.reduce((s,d)=>s+d.stats.nutrients.kcal*d.portions,0).toFixed(0)} ккал при цели ${m.target.kcal.toFixed(0)}`);
  }
}
