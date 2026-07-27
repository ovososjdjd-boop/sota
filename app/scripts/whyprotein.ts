/**
 * Что физически ограничивает белок сверху.
 *
 * Ставим прямой эксперимент: просим 1.8 г/кг явно (через профиль «набор
 * веса» белок 1.8, но там растут и калории). Смотрим, достижимо ли
 * вообще 148 г белка при 2500 ккал на нашей базе блюд.
 */
import { RECIPES } from '../src/data/recipes';
import { computeRecipeStats } from '../src/core/recipes';

export default function () {
  const rows = RECIPES.map((r) => {
    const s = computeRecipeStats(r);
    return {
      name: r.name,
      role: r.role,
      kcal: s.nutrients.kcal,
      protein: s.nutrients.protein,
      // белок на 100 ккал — ключевая метрика: сколько белка можно
      // набрать, не выходя за калории
      per100: (s.nutrients.protein / Math.max(1, s.nutrients.kcal)) * 100,
      cost: s.cost,
    };
  }).sort((a, b) => b.per100 - a.per100);

  console.log('— блюда с лучшим белком на 100 ккал —');
  for (const r of rows.slice(0, 15)) {
    console.log(
      `${r.per100.toFixed(1).padStart(5)} г/100ккал  ${r.name.padEnd(30)} ` +
        `${r.kcal.toFixed(0).padStart(4)} ккал, Б ${r.protein.toFixed(0).padStart(3)}, ${r.cost.toFixed(0)} ₽ [${r.role}]`,
    );
  }

  // Чтобы получить 1.8 г/кг = 148 г белка при 2500 ккал,
  // нужна плотность 148/2500*100 = 5.9 г на 100 ккал.
  for (const need of [3.9, 4.9, 5.9, 7.0]) {
    const n = rows.filter((r) => r.per100 >= need).length;
    const gkg = ((need / 100) * 2500) / 82;
    console.log(
      `блюд с плотностью ≥${need} г/100ккал: ${n} из ${rows.length} ` +
        `(рацион целиком из них дал бы ${gkg.toFixed(1)} г/кг)`,
    );
  }

  // средневзвешенная плотность по ролям
  const byRole = new Map<string, { p: number; k: number }>();
  for (const r of rows) {
    const cur = byRole.get(r.role) ?? { p: 0, k: 0 };
    cur.p += r.protein;
    cur.k += r.kcal;
    byRole.set(r.role, cur);
  }
  console.log('\nсредняя плотность белка по ролям:');
  for (const [role, v] of [...byRole.entries()].sort(
    (a, b) => (b[1].p / b[1].k) - (a[1].p / a[1].k),
  )) {
    console.log(`  ${role.padEnd(9)} ${((v.p / v.k) * 100).toFixed(1)} г/100ккал`);
  }
}
