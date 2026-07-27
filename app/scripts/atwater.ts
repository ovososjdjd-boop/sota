import { PRODUCTS } from '../src/data/products';
import { atwaterDiscrepancy } from '../src/core/nutrition';
export default function () {
  const rows = PRODUCTS.filter(p => p.per100g.kcal > 0)
    .map(p => ({ n: p.name, d: atwaterDiscrepancy(p.per100g), k: p.per100g.kcal,
      c: p.per100g.protein*4 + p.per100g.fat*9 + p.per100g.carbs*4, f: p.per100g.fiber }))
    .sort((a,b) => b.d - a.d).slice(0, 15);
  for (const r of rows) console.log(`${(r.d*100).toFixed(0).padStart(3)}%  ${r.n.padEnd(32)} заявлено ${r.k}  по Атуотеру ${r.c.toFixed(1)}  клетч ${r.f}`);
}
