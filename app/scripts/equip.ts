/**
 * Адаптация под кухню: работает ли приложение без духовки,
 * без плиты и с мультиваркой.
 *
 * Главная проверка — что человек с минимальной кухней получает
 * не отказ, а осмысленный рацион.
 */
import { planMenu } from '../src/core/menuPlanner';
import { RECIPES } from '../src/data/recipes';
import {
  DEFAULT_EQUIPMENT,
  MINIMAL_EQUIPMENT,
  type Equipment,
} from '../src/core/equipment';
import { emptyPreferences } from '../src/core/preferences';
import { makeEaterLike } from './simProfile';

export default async function main() {
  const cases: [string, Equipment[]][] = [
    ['по умолчанию (плита, чайник, СВЧ)', DEFAULT_EQUIPMENT],
    ['+ духовка', [...DEFAULT_EQUIPMENT, 'oven']],
    ['+ духовка + мультиварка + блендер', [...DEFAULT_EQUIPMENT, 'oven', 'multicooker', 'blender']],
    ['минимум: чайник и СВЧ', MINIMAL_EQUIPMENT],
    ['только чайник', ['kettle']],
  ];

  for (const [name, eq] of cases) {
    // сколько блюд вообще доступно
    const available = RECIPES.filter(
      (r) => !r.requires || r.requires.every((x) => eq.includes(x)),
    ).length;

    const m = await planMenu(
      {
        budget: 15000,
        days: 30,
        eaters: [makeEaterLike()],
        preferences: emptyPreferences(),
        equipment: eq,
      },
      RECIPES,
    );

    if (m.status !== 'optimal') {
      console.log(`${name.padEnd(36)} доступно ${available} блюд → ${m.status}`);
      continue;
    }
    let empty = 0;
    for (const d of m.schedule.days)
      for (const meal of d.meals)
        if (meal.dishes.length === 0 && meal.slot !== 'snack') empty++;

    console.log(
      `${name.padEnd(36)} доступно ${String(available).padStart(3)} блюд  ` +
        `ккал/д ${(m.actual.kcal / 30).toFixed(0)}  белок ${(m.actual.protein / 30 / 82).toFixed(2)}  ` +
        `блюд в меню ${String(m.demands.length).padStart(2)}  пустых приёмов ${empty}`,
    );
  }
}
