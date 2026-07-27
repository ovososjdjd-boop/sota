/** Разброс цен по базе: на чём строить деление на классы. */
import { PRODUCTS } from '../src/data/products';
export default function () {
  const byCat = new Map<string, {n:number; min:number; max:number; med:number[]}>();
  for (const p of PRODUCTS) {
    const c = byCat.get(p.category) ?? {n:0,min:1e9,max:0,med:[]};
    c.n++; c.min=Math.min(c.min,p.pricePerKg); c.max=Math.max(c.max,p.pricePerKg); c.med.push(p.pricePerKg);
    byCat.set(p.category,c);
  }
  console.log('категория     n   мин   макс  медиана  ₽/1000ккал(мед)');
  for (const [cat,v] of [...byCat.entries()].sort((a,b)=>b[1].n-a[1].n)) {
    const s=v.med.sort((a,b)=>a-b); const med=s[Math.floor(s.length/2)];
    const kcalCost = PRODUCTS.filter(p=>p.category===cat && p.per100g.kcal>0)
      .map(p=>p.pricePerKg/(p.per100g.kcal*10)*1000).sort((a,b)=>a-b);
    console.log(`${cat.padEnd(11)} ${String(v.n).padStart(3)} ${String(v.min).padStart(5)} ${String(v.max).padStart(6)} ${String(med).padStart(7)}  ${kcalCost.length?kcalCost[Math.floor(kcalCost.length/2)].toFixed(0):'—'}`);
  }
  const all = PRODUCTS.filter(p=>p.per100g.kcal>0).map(p=>({n:p.name,c:p.pricePerKg/(p.per100g.kcal*10)*1000})).sort((a,b)=>a.c-b.c);
  console.log('\nсамые дешёвые калории:', all.slice(0,6).map(x=>`${x.n} ${x.c.toFixed(0)}₽/1000ккал`).join(', '));
  console.log('самые дорогие:', all.slice(-6).map(x=>`${x.n} ${x.c.toFixed(0)}`).join(', '));
}
