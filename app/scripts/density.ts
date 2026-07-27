/**
 * Плотность калорий на минуту готовки.
 *
 * При лимите «60 минут в день» и норме 2500 ккал человеку нужно
 * 42 ккал на каждую минуту у плиты (с поправкой на batch cooking —
 * меньше, но порядок такой). Если в базе таких блюд мало, никакой
 * алгоритм не спасёт: это дефицит ДАННЫХ, а не логики.
 */
import { RECIPES } from '../src/data/recipes';
import { computeRecipeStats } from '../src/core/recipes';

export default function () {
  const rows = RECIPES.map((r) => {
    const s = computeRecipeStats(r);
    // одна готовка кормит batchPortions порций
    const perCook = Math.max(1, r.batchPortions);
    const kcalPerMinute = (s.nutrients.kcal * perCook) / Math.max(1, r.minutes);
    return {
      name: r.name,
      role: r.role,
      minutes: r.minutes,
      batch: r.batchPortions,
      keeps: r.keepsDays,
      kcal: s.nutrients.kcal,
      density: kcalPerMinute,
    };
  }).sort((a, b) => b.density - a.density);

  console.log('— самые «время-эффективные» блюда —');
  for (const r of rows.slice(0, 12)) {
    console.log(
      `${r.density.toFixed(0).padStart(4)} ккал/мин  ${r.name.padEnd(30)} ` +
        `${String(r.minutes).padStart(3)} мин × ${r.batch} порц, хранится ${r.keeps} дн [${r.role}]`,
    );
  }
  console.log('\n— самые затратные —');
  for (const r of rows.slice(-8)) {
    console.log(
      `${r.density.toFixed(0).padStart(4)} ккал/мин  ${r.name.padEnd(30)} ` +
        `${String(r.minutes).padStart(3)} мин × ${r.batch} порц [${r.role}]`,
    );
  }

  // сколько блюд-основ дают хорошую плотность
  const cores = rows.filter((r) => ['main', 'soup', 'porridge'].includes(r.role));
  for (const th of [80, 60, 40, 30]) {
    const n = cores.filter((r) => r.density >= th).length;
    console.log(`основ с плотностью ≥${th} ккал/мин: ${n} из ${cores.length}`);
  }

  // медиана по основам
  const d = cores.map((r) => r.density).sort((a, b) => a - b);
  console.log(`медианная плотность основ: ${d[Math.floor(d.length / 2)].toFixed(0)} ккал/мин`);

  // сколько блюд хранятся и готовятся партией — пригодны для готовки впрок
  const batchable = RECIPES.filter((r) => r.keepsDays > 0 && r.batchPortions > 1).length;
  console.log(`пригодны для готовки впрок: ${batchable} из ${RECIPES.length}`);
}
