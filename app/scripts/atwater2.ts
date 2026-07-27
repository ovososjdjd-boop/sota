import { PRODUCTS } from '../src/data/products';
export default function () {
  for (const p of PRODUCTS) {
    const n = p.per100g;
    const short = n.protein*4 + n.fat*9 + n.carbs*4;
    const long = short + (n.organicAcids ?? 0)*3;
    if ((n.organicAcids ?? 0) > 0)
      console.log(`${p.name.padEnd(24)} заявл ${String(n.kcal).padStart(4)}  коротк ${short.toFixed(1).padStart(6)}  расшир ${long.toFixed(1).padStart(6)}  кисл ${n.organicAcids}`);
  }
}
