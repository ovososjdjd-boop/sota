import highsLoader from "highs";
const highs = await highsLoader();
// синтетическая база N продуктов, каждый с домашней мерой -> целые единицы
function gen(N, seed=42) {
  let s = seed; const rnd = () => (s = (s*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({length:N}, (_,i) => {
    const prot = rnd()*25, fat = rnd()*30, carb = rnd()*70;
    const kcal = prot*4 + fat*9 + carb*4;
    return { id:i, unit_g: 20+Math.floor(rnd()*200), price: 40+rnd()*600, kcal, prot, fat, carb,
             max: 3+Math.floor(rnd()*15) };
  });
}
function solve(P, T, budget) {
  let lp = "Minimize\n obj: " + ["kcal","prot","fat","carb"].map(n=>`${n==="kcal"?1:12} p_${n} + ${n==="kcal"?1:12} m_${n}`).join(" + ") + "\n";
  lp += "Subject To\n";
  for (const n of ["kcal","prot","fat","carb"]) {
    lp += ` b_${n}: ` + P.map(r=>`${((r.unit_g/100)*r[n]).toFixed(4)} u${r.id}`).join(" + ") + ` - p_${n} + m_${n} = ${T[n]}\n`;
  }
  lp += ` bud: ` + P.map(r=>`${((r.unit_g/1000)*r.price).toFixed(4)} u${r.id}`).join(" + ") + ` <= ${budget}\n`;
  lp += "Bounds\n" + P.map(r=>` 0 <= u${r.id} <= ${r.max}\n`).join("");
  lp += "General\n " + P.map(r=>`u${r.id}`).join(" ") + "\nEnd\n";
  const t0 = Date.now();
  const sol = highs.solve(lp, {output_flag:false, time_limit:20, mip_rel_gap:0.01});
  return { ms: Date.now()-t0, status: sol.Status, obj: sol.ObjectiveValue,
           picked: P.filter(r=>sol.Columns[`u${r.id}`].Primal>0.001).length };
}
const T = { kcal:14000, prot:700, fat:550, carb:1750 };
console.log("N продуктов | статус  | время   | выбрано позиций");
for (const N of [50, 100, 300, 500, 1000, 2000]) {
  const r = solve(gen(N), T, 2500);
  console.log(`${String(N).padStart(11)} | ${r.status.padEnd(7)} | ${String(r.ms+" ms").padStart(7)} | ${r.picked}`);
}
