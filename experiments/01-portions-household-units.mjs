import highsLoader from "highs";
const highs = await highsLoader();

// Продукты с ДОМАШНЕЙ МЕРОЙ. unit_g = масса одной бытовой единицы (г).
// Источник масс: справочник Скурихина, прил.2-3 (меры объёма / масса 1 шт) - значения-заглушки
const P = [
 // name              unit        unit_g  price/kg kcal  prot fat  carb  maxUnits(нед)
 ["Гречка",           "стакан",     210,   120,   330, 12.6, 3.3, 62,   10],
 ["Рис",              "стакан",     180,   110,   340,  7.0, 1.0, 74,   10],
 ["Овсянка",          "стакан",     100,   100,   350, 12.0, 6.0, 61,   14],
 ["Макароны",         "горсть/100г",100,    90,   350, 11.0, 1.3, 70,   10],
 ["Картофель",        "шт средн.",  100,    45,    77,  2.0, 0.4, 17,   35],
 ["Курица (бедро)",   "шт",         150,   280,   185, 17.0,12.0,  0,   14],
 ["Яйцо",             "шт",          55,   160,   157, 12.7,11.5, 0.7,  21],
 ["Молоко",           "стакан",     250,    85,    60,  2.9, 3.2, 4.7,  21],
 ["Творог 5%",        "пачка 200г", 200,   220,   121, 16.0, 5.0, 3.0,  10],
 ["Капуста",          "шт средн.",  120,    40,    28,  1.8, 0.1, 4.7,  14],
 ["Морковь",          "шт средн.",   85,    50,    35,  1.3, 0.1, 6.9,  14],
 ["Лук",              "шт средн.",   75,    45,    41,  1.4, 0.2, 8.2,  14],
 ["Масло подсолн.",   "ст.ложка",    17,   140,   899,  0,  99.9, 0,    21],
 ["Хлеб",             "ломоть",      30,    95,   250,  8.0, 3.0, 48,   35],
 ["Яблоко",           "шт",         180,   130,    47,  0.4, 0.4, 9.8,  14],
];

const T = { kcal: 14000, prot: 700, fat: 550, carb: 1750 };
const BUDGET = 2000;
const nutIdx = { kcal:4, prot:5, fat:6, carb:7 };

function build(integerUnits) {
  let lp = "Minimize\n obj: ";
  lp += ["kcal","prot","fat","carb"].map(n=>{
    const w = n==="kcal" ? 1 : 12;
    return `${w} p_${n} + ${w} m_${n}`;
  }).join(" + ") + "\n";
  lp += "Subject To\n";
  for (const [n, idx] of Object.entries(nutIdx)) {
    // вклад одной единицы = unit_g/100 * per100g
    const s = P.map((r,i)=>`${((r[2]/100)*r[idx]).toFixed(4)} u${i}`).join(" + ");
    lp += ` bal_${n}: ${s} - p_${n} + m_${n} = ${T[n]}\n`;
  }
  lp += ` budget: ${P.map((r,i)=>`${((r[2]/1000)*r[3]).toFixed(4)} u${i}`).join(" + ")} <= ${BUDGET}\n`;
  lp += ` prot_div: u5 + u6 + u8 >= 8\n`;
  lp += ` veg: u9 + u10 + u14 >= 10\n`;
  lp += "Bounds\n";
  P.forEach((r,i)=> lp += ` 0 <= u${i} <= ${r[8]}\n`);
  if (integerUnits) { lp += "General\n " + P.map((_,i)=>`u${i}`).join(" ") + "\n"; }
  lp += "End\n";
  return lp;
}

function report(label, lp) {
  const t0 = Date.now();
  const sol = highs.solve(lp, {output_flag:false});
  const ms = Date.now()-t0;
  let cost=0, tot={kcal:0,prot:0,fat:0,carb:0}; const lines=[];
  P.forEach((r,i)=>{
    const q = sol.Columns[`u${i}`].Primal;
    if (q > 0.001) {
      cost += (r[2]/1000)*r[3]*q;
      for (const [n,idx] of Object.entries(nutIdx)) tot[n] += (r[2]/100)*r[idx]*q;
      lines.push(`   ${r[0].padEnd(17)} ${q.toFixed(2).padStart(6)} × ${r[1]}`);
    }
  });
  console.log(`\n=== ${label} === (${sol.Status}, ${ms} ms)`);
  lines.forEach(l=>console.log(l));
  const dev = n => ((tot[n]-T[n])/T[n]*100);
  console.log(`   Цена: ${cost.toFixed(0)} ₽ | ккал/день ${(tot.kcal/7).toFixed(0)} (${dev("kcal")>=0?"+":""}${dev("kcal").toFixed(1)}%)`);
  console.log(`   Б ${(tot.prot/7).toFixed(0)}г (${dev("prot").toFixed(1)}%) Ж ${(tot.fat/7).toFixed(0)}г (${dev("fat").toFixed(1)}%) У ${(tot.carb/7).toFixed(0)}г (${dev("carb").toFixed(1)}%)`);
  return {dev:["kcal","prot","fat","carb"].map(n=>Math.abs(dev(n))), ms};
}

const a = report("A. Непрерывно (граммы, нужны весы)", build(false));
const b = report("B. ЦЕЛЫЕ домашние меры (без весов)", build(true));

console.log("\n--- ИТОГ ---");
console.log(`Макс. отклонение непрерывно: ${Math.max(...a.dev).toFixed(2)}%`);
console.log(`Макс. отклонение в целых мерах: ${Math.max(...b.dev).toFixed(2)}%`);
console.log(`Цена перехода на "без весов": ${(Math.max(...b.dev)-Math.max(...a.dev)).toFixed(2)} п.п.`);
console.log(`Время MILP: ${b.ms} ms`);
