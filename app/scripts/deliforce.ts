/** Может ли солвер вообще взять деликатес: даём предпочтение «люблю». */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';
export default async function main() {
  const prefs = emptyPreferences();
  prefs.dishes['beef_steak_potato'] = 'often';
  prefs.dishes['shrimp_pasta'] = 'often';
  const m = await planMenu({budget:35000,days:30,eaters:[makeEaterLike()],preferences:prefs,mode:'premium'},RECIPES);
  if (m.status!=='optimal') return console.log(m.status);
  const used = new Map(m.demands.map(d=>[d.stats.recipe.id,d.portions]));
  console.log('стейк:', used.get('beef_steak_potato') ?? 0, 'креветки:', used.get('shrimp_pasta') ?? 0);
  console.log('чек', Math.round(m.purchaseCost), 'блюд', m.demands.length);
  // топ по стоимости порции в заказе
  const top = m.demands.map(d=>({n:d.stats.recipe.name,c:d.stats.cost,p:d.portions}))
    .sort((a,b)=>b.c-a.c).slice(0,8);
  console.log('самые дорогие в заказе:', top.map(x=>`${x.n} ${x.c.toFixed(0)}₽×${x.p}`).join('; '));
}
