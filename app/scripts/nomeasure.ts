/** Продукты без домашних мер: они покажутся голыми граммами. */
import { PRODUCTS } from '../src/data/products';
export default function () {
  const bad = PRODUCTS.filter(p => p.measures.length === 0 && p.packSizes.length === 0);
  console.log('без мер и фасовок:', bad.map(p=>p.id).join(', ') || 'нет');
  const noMeas = PRODUCTS.filter(p => p.measures.length === 0);
  console.log(`\nбез домашних мер (${noMeas.length}):`, noMeas.map(p=>`${p.id}`).join(', '));
}
