import { RECIPES } from '../src/data/recipes';
export default function () {
  const miss = RECIPES.filter(r => !r.steps || r.steps.length === 0);
  console.log(`без шагов: ${miss.length} из ${RECIPES.length}`);
  console.log(miss.map(r=>r.id).join(' '));
}
