/**
 * Пересечение ингредиентов: сколько мы теряем на «размазывании» закупки.
 *
 * Метрика переплаты: (чек по упаковкам) / (стоимость нетто) − 1.
 * Если блюда недели используют разные продукты, каждый требует своей
 * упаковки, и переплата растёт. Если блюда «дружат» составом,
 * одна пачка риса расходуется полностью.
 *
 * Считаем и коэффициент Жаккара по парам блюд, попавших в меню, —
 * это то, что мы собираемся оптимизировать.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { grossFromNet, packsNeeded } from '../src/core/measures';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

/** Доля продукта, которая пропадёт как «хвост» упаковки. */
function wasteReport(products: Record<string, number>) {
  let net = 0;
  let paid = 0;
  const worst: { name: string; leftover: number; cost: number }[] = [];
  for (const [pid, grams] of Object.entries(products)) {
    const p = PRODUCT_BY_ID[pid];
    if (!p) continue;
    const gross = grossFromNet(p, grams);
    const packs = packsNeeded(p, gross);
    net += (gross / 1000) * p.pricePerKg;
    paid += (packs.totalGrams / 1000) * p.pricePerKg;
    if (packs.leftover > 0) {
      worst.push({
        name: p.name,
        leftover: packs.leftover,
        cost: (packs.leftover / 1000) * p.pricePerKg,
      });
    }
  }
  worst.sort((a, b) => b.cost - a.cost);
  return { net, paid, overpay: paid / Math.max(1, net) - 1, worst };
}

export default async function main() {
  const prefs: Preferences = emptyPreferences();
  prefs.products['mince'] = 'often';

  for (const days of [7, 14, 30]) {
    const budget = days === 7 ? 3500 : days === 14 ? 7000 : 15000;
    const m = await planMenu(
      { budget, days, eaters: [makeEaterLike()], preferences: prefs },
      RECIPES,
    );
    if (m.status !== 'optimal') {
      console.log(days, m.status);
      continue;
    }
    const w = wasteReport(m.products);

    // средний Жаккар между парами блюд в меню
    const sets = m.demands.map(
      (d) => new Set(d.stats.recipe.ingredients.map((i) => i.productId)),
    );
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++) {
        const inter = [...sets[i]].filter((x) => sets[j].has(x)).length;
        const union = new Set([...sets[i], ...sets[j]]).size;
        sum += inter / union;
        pairs++;
      }
    const jaccard = pairs ? sum / pairs : 0;

    // сколько РАЗНЫХ продуктов задействовано
    const distinct = Object.keys(m.products).length;

    console.log(
      `${String(days).padStart(2)} дн: переплата за упаковки ${(w.overpay * 100).toFixed(0)}%  ` +
        `(нетто ${Math.round(w.net)} ₽ → чек ${Math.round(w.paid)} ₽)  ` +
        `продуктов ${distinct}  блюд ${m.demands.length}  Жаккар ${jaccard.toFixed(3)}`,
    );
    console.log(
      `        худшие хвосты: ` +
        w.worst
          .slice(0, 5)
          .map((x) => `${x.name} ${Math.round(x.leftover)} г / ${Math.round(x.cost)} ₽`)
          .join(', '),
    );
  }
}
