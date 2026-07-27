/** Проверка классификации: правдоподобна ли она глазами. */
import { PRODUCTS } from '../src/data/products';
import { classifyProduct, TIER_LABEL, type ProductTier } from '../src/core/tiers';
export default function () {
  const by = new Map<ProductTier, string[]>();
  for (const p of PRODUCTS) {
    const t = classifyProduct(p);
    by.set(t, [...(by.get(t) ?? []), `${p.name} (${p.pricePerKg}₽)`]);
  }
  for (const t of ['staple','essential','treat','indulgence'] as ProductTier[]) {
    const l = by.get(t) ?? [];
    console.log(`\n${TIER_LABEL[t]} — ${l.length} шт:`);
    console.log('  ' + l.join(', '));
  }
}
