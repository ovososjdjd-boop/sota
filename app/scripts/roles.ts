import { RECIPES } from '../src/data/recipes';
export default function () {
  const m = new Map<string, number>();
  for (const r of RECIPES) m.set(r.role, (m.get(r.role) ?? 0) + 1);
  console.log('роли:', [...m.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(', '));
  const s = new Map<string, number>();
  for (const r of RECIPES) for (const sl of r.slots) s.set(sl, (s.get(sl) ?? 0) + 1);
  console.log('слоты:', [...s.entries()].map(([k,v])=>`${k} ${v}`).join(', '));
  // где живут drink и snack
  for (const role of ['drink','snack','porridge','side','salad','bakery']) {
    const rs = RECIPES.filter(r=>r.role===role);
    console.log(`${role}: ${rs.map(r=>`${r.name}[${r.slots.join('/')}]`).join(', ')}`);
  }
}
