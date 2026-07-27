/** Во сколько штраф за остатки оценивает одну порцию деликатеса. */
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { grossFromNet, packsNeeded } from '../src/core/measures';
export default function () {
  for (const r of RECIPES.filter(x=>x.tags.includes('delicacy'))) {
    let waste = 0, need = 0;
    for (const ing of r.ingredients) {
      const p = PRODUCT_BY_ID[ing.productId]; if (!p || !p.packSizes.length) continue;
      // 6 порций — типичный максимум в шорт-листе
      const g = grossFromNet(p, ing.grams*6);
      const pk = packsNeeded(p, g);
      waste += ((pk.totalGrams - g)/1000)*p.pricePerKg;
      need += (g/1000)*p.pricePerKg;
    }
    console.log(`${r.name.padEnd(32)} на 6 порций: продукты ${need.toFixed(0)} ₽, остаток ${waste.toFixed(0)} ₽ (${(waste/Math.max(1,need)*100).toFixed(0)}%)`);
  }
}
