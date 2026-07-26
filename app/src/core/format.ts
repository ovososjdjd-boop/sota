/**
 * Форматирование чисел для UI.
 *
 * Принцип: никакой ложной точности. Цель по калориям определена
 * с погрешностью ±10%, поэтому «2096.4 ккал» — обман. Пишем «≈2100».
 */

/** Деньги: «1 240 ₽». Всегда целые рубли — копейки в планировании бессмысленны. */
export function money(rub: number): string {
  return `${Math.round(rub).toLocaleString('ru-RU')} ₽`;
}

/** Деньги без символа — когда символ рисуется отдельно. */
export function moneyPlain(rub: number): string {
  return Math.round(rub).toLocaleString('ru-RU');
}

/** Калории: округляем до 10, добавляем «≈» — честно отражает точность. */
export function kcal(value: number, approx = true): string {
  const rounded = Math.round(value / 10) * 10;
  return `${approx ? '≈' : ''}${rounded.toLocaleString('ru-RU')}`;
}

/** Граммы макронутриентов: до целых. */
export function grams(value: number): string {
  return `${Math.round(value)} г`;
}

/** Масса с автоматическим выбором единицы. */
export function mass(gramsValue: number): string {
  if (gramsValue >= 1000) {
    const kg = gramsValue / 1000;
    return `${kg % 1 === 0 ? kg : kg.toFixed(1)} кг`;
  }
  return `${Math.round(gramsValue)} г`;
}

/** Проценты отклонения со знаком. */
export function deviation(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

/** Склонение русских существительных по числу. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

/** «7 дней», «1 день», «22 дня» */
export function days(n: number): string {
  return `${n} ${plural(n, 'день', 'дня', 'дней')}`;
}

/** «4 человека», «1 человек» */
export function people(n: number): string {
  return `${n} ${plural(n, 'человек', 'человека', 'человек')}`;
}

/** «3 позиции», «1 позиция» */
export function positions(n: number): string {
  return `${n} ${plural(n, 'позиция', 'позиции', 'позиций')}`;
}

/** Цвет статуса по отклонению от нормы. */
export function deviationTone(pct: number): 'good' | 'warn' | 'bad' {
  const abs = Math.abs(pct);
  if (abs <= 7) return 'good';
  if (abs <= 15) return 'warn';
  return 'bad';
}
