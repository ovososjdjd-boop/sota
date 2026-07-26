import highsLoader from "highs";
const highs = await highsLoader();

// Мини-модель: 10 продуктов, недельное меню на 1 чел, минимизировать отклонение от КБЖУ при бюджете
// цены руб/кг, кбжу на 100г
const P = [
 //  name            price/kg  kcal  prot  fat  carb  maxKgWeek
 ["Гречка",             120,   330,  12.6,  3.3, 62,  1.5],
 ["Рис",                110,   340,   7.0,  1.0, 74,  1.5],
 ["Макароны",            90,   350,  11.0,  1.3, 70,  1.5],
 ["Картофель",           45,    77,   2.0,  0.4, 17,  4.0],
 ["Курица (бедро)",     280,   185,  17.0, 12.0,  0,  3.0],
 ["Яйцо (кг)",          160,   157,  12.7, 11.5,  0.7,1.0],
 ["Молоко (кг)",         85,    60,   2.9,  3.2,  4.7,4.0],
 ["Капуста",             40,    28,   1.8,  0.1,  4.7,3.0],
 ["Морковь",             50,    35,   1.3,  0.1,  6.9,2.0],
 ["Масло подсолн.",     140,   899,   0,   99.9,  0,  0.5],
];

// цель на неделю: 2000 ккал/сут * 7
const T = { kcal: 14000, prot: 700, fat: 550, carb: 1750 };
const BUDGET = 1500; // руб/нед

// переменные x_i в кг (непрерывные, шаг 0.1 через целые d_i)
// отклонения по каждому нутриенту: положит/отрицат
let lp = "Minimize\n obj: ";
const terms = [];
for (const n of ["kcal","prot","fat","carb"]) {
  const w = n === "kcal" ? 1 : 10; // вес: макросы важнее в граммах
  terms.push(`${w} p_${n} + ${w} m_${n}`);
}
lp += terms.join(" + ") + "\n";
lp += "Subject To\n";
// баланс нутриентов: sum(x_i * per100g*10) - p + m = target
const nutIdx = { kcal:2, prot:3, fat:4, carb:5 };
for (const [n, idx] of Object.entries(nutIdx)) {
  const s = P.map((r,i)=>`${(r[idx]*10).toFixed(3)} x${i}`).join(" + ");
  lp += ` bal_${n}: ${s} - p_${n} + m_${n} = ${T[n]}\n`;
}
// бюджет
lp += ` budget: ${P.map((r,i)=>`${r[1]} x${i}`).join(" + ")} <= ${BUDGET}\n`;
// разнообразие: минимум 3 разных категории белка -> хотя бы курица+яйцо+молоко в сумме >= 1.5кг
lp += ` protein_div: x4 + x5 + x6 >= 1.5\n`;
lp += "Bounds\n";
P.forEach((r,i)=> lp += ` 0 <= x${i} <= ${r[6]}\n`);
lp += "End\n";

const t0 = Date.now();
const sol = highs.solve(lp);
const ms = Date.now() - t0;

console.log("Status:", sol.Status, "| Objective:", sol.ObjectiveValue?.toFixed(2), "| solve time:", ms, "ms");
let cost=0, k=0,pr=0,f=0,c=0;
console.log("\nКорзина на неделю:");
P.forEach((r,i)=>{
  const q = sol.Columns[`x${i}`].Primal;
  if (q > 0.01) {
    cost += q*r[1]; k += q*r[2]*10; pr += q*r[3]*10; f += q*r[4]*10; c += q*r[5]*10;
    console.log(`  ${r[0].padEnd(18)} ${q.toFixed(2)} кг = ${(q*r[1]).toFixed(0)} ₽`);
  }
});
console.log(`\nИтого: ${cost.toFixed(0)} ₽ / бюджет ${BUDGET} ₽`);
console.log(`КБЖУ неделя: ${k.toFixed(0)} ккал (цель ${T.kcal}), Б ${pr.toFixed(0)}г (${T.prot}), Ж ${f.toFixed(0)}г (${T.fat}), У ${c.toFixed(0)}г (${T.carb})`);
console.log(`В день: ${(k/7).toFixed(0)} ккал, Б ${(pr/7).toFixed(0)} Ж ${(f/7).toFixed(0)} У ${(c/7).toFixed(0)}`);
