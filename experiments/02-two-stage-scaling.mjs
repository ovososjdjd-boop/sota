import highsLoader from "highs";
const highs = await highsLoader();
function gen(N, seed=42) {
  let s = seed; const rnd = () => (s = (s*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({length:N}, (_,i) => {
    const prot=rnd()*25, fat=rnd()*30, carb=rnd()*70;
    return { id:i, unit_g:20+Math.floor(rnd()*200), price:40+rnd()*600,
             kcal:prot*4+fat*9+carb*4, prot, fat, carb, max:3+Math.floor(rnd()*15) };
  });
}
function build(P, T, budget, integer) {
  let lp = "Minimize\n obj: " + ["kcal","prot","fat","carb"].map(n=>`${n==="kcal"?1:12} p_${n} + ${n==="kcal"?1:12} m_${n}`).join(" + ") + "\n Subject To\n";
  for (const n of ["kcal","prot","fat","carb"])
    lp += ` b_${n}: ` + P.map(r=>`${((r.unit_g/100)*r[n]).toFixed(4)} u${r.id}`).join(" + ") + ` - p_${n} + m_${n} = ${T[n]}\n`;
  lp += ` bud: ` + P.map(r=>`${((r.unit_g/1000)*r.price).toFixed(4)} u${r.id}`).join(" + ") + ` <= ${budget}\n`;
  lp += "Bounds\n" + P.map(r=>` 0 <= u${r.id} <= ${r.max}\n`).join("");
  if (integer) lp += "General\n " + P.map(r=>`u${r.id}`).join(" ") + "\n";
  return lp + "End\n";
}
const T = {kcal:14000, prot:700, fat:550, carb:1750}, BUD=2500;
console.log("N     | 1-этап MILP      | 2-этапа (LP→shortlist→MILP)   | ускор.");
for (const N of [500, 1000, 2000, 5000]) {
  const P = gen(N);
  const t0=Date.now(); const s1=highs.solve(build(P,T,BUD,true),{output_flag:false,mip_rel_gap:0.01}); const ms1=Date.now()-t0;
  const t1=Date.now();
  const lpSol = highs.solve(build(P,T,BUD,false),{output_flag:false});           // этап 1: LP, быстрый
  const scored = P.map(r=>({r, v: lpSol.Columns[`u${r.id}`].Primal})).sort((a,b)=>b.v-a.v);
  const short = scored.slice(0, 120).map(x=>x.r);                                 // этап 2: топ-120
  const s2 = highs.solve(build(short,T,BUD,true),{output_flag:false,mip_rel_gap:0.01});
  const ms2=Date.now()-t1;
  const gap = ((s2.ObjectiveValue-s1.ObjectiveValue)/Math.max(1,s1.ObjectiveValue)*100);
  console.log(`${String(N).padStart(5)} | ${(s1.Status+" "+ms1+"ms").padEnd(16)} | ${(s2.Status+" "+ms2+"ms, потеря "+gap.toFixed(2)+"%").padEnd(29)} | ${(ms1/ms2).toFixed(1)}×`);
}
