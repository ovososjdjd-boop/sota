/**
 * СИМУЛЯЦИЯ МЕСЯЦА — глазами человека из задания.
 *
 * Профиль: мужчина 32, 180 см, 82 кг, офис. 15 000 ₽ в месяц, один.
 * Любит мясо с гарниром, особенно фарш. Хочет больше белка.
 * Зелень не любит. Иногда сладкое. Кофе — каждый день.
 *
 * Прохожу путь целиком: настройка → меню → магазин → готовка,
 * и смотрю на цифры так, как их увидит человек.
 */
import { planMenu, type MenuResult } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_ID } from '../src/data/products';
import { emptyPreferences, type Preferences } from '../src/core/preferences';
import { planWaves } from '../src/core/waves';
import { grossFromNet, packsNeeded } from '../src/core/measures';
import { MODE_LABEL } from '../src/core/tiers';
import { recipePortions } from '../src/core/recipes';
import type { EaterProfile } from '../src/core/types';

const me: EaterProfile = {
  id: 'me',
  name: 'Я',
  sex: 'male',
  age: 32,
  heightCm: 180,
  weightKg: 82,
  activity: 'sedentary',
  goal: 'maintain',
  proteinPerKg: 1.8, // «хочу больше белка» — двигаю ползунок
  excludedProducts: [],
  dietTags: [],
};

/** Что я отметил в настройках. */
function myPreferences(): Preferences {
  const p = emptyPreferences();
  // люблю мясо, особенно фарш
  p.products['mince'] = 'often';
  p.products['mince_chicken'] = 'often';
  p.products['pork'] = 'often';
  p.products['chicken_fillet'] = 'often';
  p.products['beef'] = 'often';
  // зелень не люблю
  p.products['greens'] = 'never';
  // кофе каждый день
  p.dishes['coffee_milk'] = 'always';
  return p;
}

function catShare(m: MenuResult, cat: string): number {
  let s = 0;
  let t = 0;
  for (const d of m.schedule.days)
    for (const meal of d.meals)
      for (const dish of meal.dishes)
        for (const ing of dish.recipe.ingredients) {
          const p = PRODUCT_BY_ID[ing.productId];
          if (!p) continue;
          const k = ((p.per100g.kcal * ing.grams) / 100) * dish.portions;
          if (p.category === cat) s += k;
          t += k;
        }
  return t ? (s / t) * 100 : 0;
}

export default async function main() {
  const days = 30;
  const budget = 15000;
  const menu = await planMenu(
    { budget, days, eaters: [me], preferences: myPreferences() },
    RECIPES,
  );

  if (menu.status !== 'optimal') {
    console.log('НЕ СОБРАЛОСЬ:', menu.status);
    for (const e of menu.explanations) console.log(' ', e.text);
    return;
  }

  console.log('═'.repeat(64));
  console.log(`МОЙ МЕСЯЦ: ${budget} ₽, режим «${MODE_LABEL[menu.mode]}»`);
  console.log('═'.repeat(64));

  // ── деньги ──
  console.log(
    `\nДЕНЬГИ\n  чек ${Math.round(menu.purchaseCost)} ₽ из ${budget} ` +
      `(${((menu.purchaseCost / budget) * 100).toFixed(0)}%), остаётся ${Math.round(budget - menu.purchaseCost)} ₽`,
  );
  console.log(`  еды на ${Math.round(menu.totalCost)} ₽, останется дома на ${Math.round(menu.leftoverValue)} ₽`);

  // ── питание ──
  const pd = days;
  console.log(
    `\nПИТАНИЕ\n  ${(menu.actual.kcal / pd).toFixed(0)} ккал/д (цель ${(menu.target.kcal / pd).toFixed(0)})  ` +
      `белок ${(menu.actual.protein / pd).toFixed(0)} г = ${(menu.actual.protein / pd / 82).toFixed(2)} г/кг (просил 1.8)`,
  );
  console.log(
    `  мясо ${catShare(menu, 'meat').toFixed(1)}%  рыба ${catShare(menu, 'fish').toFixed(1)}%  ` +
      `фрукты ${catShare(menu, 'fruit').toFixed(1)}%  молочка ${catShare(menu, 'dairy').toFixed(1)}%  ` +
      `сладкое ${catShare(menu, 'sweet').toFixed(1)}%`,
  );

  // ── повторяемость: главная боль прошлого раза ──
  const served = new Map<string, number>();
  const sigs: string[] = [];
  let emptyMeals = 0;
  let totalMin = 0;
  let worstDay = 0;
  const coffeeDays = new Set<number>();
  for (const d of menu.schedule.days) {
    const sig: string[] = [];
    for (const meal of d.meals) {
      if (meal.dishes.length === 0 && meal.slot !== 'snack') emptyMeals++;
      for (const dish of meal.dishes) {
        served.set(dish.recipe.id, (served.get(dish.recipe.id) ?? 0) + 1);
        sig.push(dish.recipe.id);
        if (dish.recipe.id === 'coffee_milk') coffeeDays.add(d.index);
      }
    }
    sigs.push([...sig].sort().join('|'));
    totalMin += d.minutes;
    worstDay = Math.max(worstDay, d.minutes);
  }
  const top = [...served.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(
    `\nРАЗНООБРАЗИЕ\n  блюд ${served.size} из ${RECIPES.length}  ` +
      `одинаковых дней ${sigs.length - new Set(sigs).size}  пустых приёмов ${emptyMeals}`,
  );
  console.log(
    `  чаще всего: ${top.map(([id, n]) => `${RECIPES.find((r) => r.id === id)?.name} ×${n}`).join(', ')}`,
  );
  console.log(`  кофе: ${coffeeDays.size} дней из ${days}`);

  // ── готовка ──
  console.log(`\nГОТОВКА\n  ${Math.round(totalMin / days)} мин/д, худший день ${worstDay} мин`);

  // ── фарш: я же просил ──
  const minceG = (menu.products['mince'] ?? 0) + (menu.products['mince_chicken'] ?? 0);
  const minceDishes = [...served.keys()].filter((id) => {
    const r = RECIPES.find((x) => x.id === id);
    return r?.ingredients.some((i) => i.productId === 'mince' || i.productId === 'mince_chicken');
  });
  console.log(
    `\nФАРШ (мой любимый)\n  куплено ${Math.round(minceG)} г, блюд с фаршем в меню: ${minceDishes.length}`,
  );
  console.log('  ' + minceDishes.map((id) => RECIPES.find((r) => r.id === id)?.name).join(', '));

  // ── зелень: я просил её убрать ──
  const greensG = menu.products['greens'] ?? 0;
  console.log(`\nЗЕЛЕНЬ (просил не предлагать)\n  куплено ${Math.round(greensG)} г`);

  // ── поход в магазин ──
  const waves = planWaves(menu.schedule);
  console.log(`\nПОХОДЫ В МАГАЗИН: ${waves.length}`);
  for (const w of waves) {
    const risky = w.lines.filter((l) => !l.fitsShelfLife);
    console.log(
      `  поход ${w.index + 1} (день ${w.dayIndex + 1}): ${Math.round(w.cost)} ₽, ` +
        `${w.lines.length} позиций${risky.length ? `, рискуют испортиться: ${risky.length}` : ''}`,
    );
  }

  // ── самые тяжёлые позиции ──
  const heavy = Object.entries(menu.products)
    .map(([id, g]) => {
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const packs = packsNeeded(p, grossFromNet(p, g));
      return { name: p.name, kg: packs.totalGrams / 1000, shelf: p.shelfLifeDays };
    })
    .filter(Boolean)
    .sort((a, b) => b!.kg - a!.kg)
    .slice(0, 5) as { name: string; kg: number; shelf: number }[];
  console.log('\nСАМЫЕ ОБЪЁМНЫЕ ПОКУПКИ');
  for (const h of heavy) console.log(`  ${h.name} — ${h.kg.toFixed(1)} кг (срок ${h.shelf} дн)`);

  // ── что мне скажет приложение ──
  console.log('\nПОДСКАЗКИ ПРИЛОЖЕНИЯ');
  for (const e of menu.explanations) console.log(`  [${e.kind}] ${e.text}`);

  // ── как выглядит первый день ──
  console.log('\n' + '─'.repeat(64));
  console.log('ДЕНЬ 1 — что я буду есть');
  console.log('─'.repeat(64));
  const d1 = menu.schedule.days[0];
  const slotName: Record<string, string> = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    snack: 'Перекус',
    dinner: 'Ужин',
  };
  for (const meal of d1.meals) {
    console.log(`\n${slotName[meal.slot]} (${Math.round(meal.nutrients.kcal)} ккал)`);
    if (meal.dishes.length === 0) {
      console.log('  — пусто —');
      continue;
    }
    for (const dish of meal.dishes) {
      console.log(
        `  • ${dish.recipe.name} — ${Math.round(dish.stats.cookedGrams)} г, ` +
          `${Math.round(dish.stats.nutrients.kcal * dish.portions)} ккал` +
          `${dish.cooked ? `, готовить ${dish.recipe.minutes} мин` : ', разогреть'}`,
      );
    }
  }

  // ── рецепт: могу ли я по нему готовить ──
  const mainDish = d1.meals
    .flatMap((m) => m.dishes)
    .find((d) => d.recipe.role === 'main');
  if (mainDish) {
    console.log('\n' + '─'.repeat(64));
    console.log(`РЕЦЕПТ: ${mainDish.recipe.name}`);
    console.log('─'.repeat(64));
    for (const p of recipePortions(mainDish.recipe, mainDish.portions)) {
      console.log(`  ${p.name}: ${p.measure} (${Math.round(p.grams)} г)`);
    }
    console.log('  Как готовить:');
    (mainDish.recipe.steps ?? []).forEach((st, i) => console.log(`   ${i + 1}. ${st}`));
  }
}
