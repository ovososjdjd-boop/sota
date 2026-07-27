/**
 * Визуальная проверка экрана настроек: смотрим глазами на то,
 * что реально попадает в DOM. Зелёный тест не гарантирует, что
 * пользователь видит осмысленный текст — большинство дефектов
 * в этом проекте найдено именно чтением вывода.
 *
 * Запуск с показом: SHOW=1 npx vitest run --project ui render-settings
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useAppState } from '../state/store';

/** Показывать ли «скриншот» в консоль: SHOW=1 npx vitest ... */
const SHOW = Boolean((import.meta as { env?: Record<string, unknown> }).env?.VITE_SHOW);

function Harness() {
  const store = useAppState();
  return <SettingsScreen store={store} />;
}

/** Грубый «скриншот» в текст: только видимые надписи, по строкам. */
function textDump(root: HTMLElement): string {
  const out: string[] = [];
  const walk = (el: Element, depth: number) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const i = el as HTMLInputElement;
      out.push(`${'  '.repeat(depth)}[input ${i.type}${i.type === 'range' ? ` ${i.min}..${i.max} = ${i.value}` : ` = "${i.value}"`}]`);
      return;
    }
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (own) out.push(`${'  '.repeat(depth)}${own}`);
    for (const child of el.children) walk(child, own ? depth + 1 : depth);
  };
  walk(root, 0);
  return out.join('\n');
}

describe('экран настроек: ползунок белка', () => {
  it('ползунок виден и подписан человеческим языком', async () => {
    const { container } = render(<Harness />);
    const dump = textDump(container);
    if (SHOW) console.log('\n' + dump + '\n');

    expect(dump).toMatch(/Белок/);
    // подпись обязана объяснять смысл, а не просто показывать число
    expect(dump).toMatch(/г\/кг/);
    expect(dump).toMatch(/1\.2 г\/кг/);
    const slider = container.querySelector('input[type="range"]');
    expect(slider).toBeTruthy();
    expect(slider).toHaveAttribute('min', '0.8');
    expect(slider).toHaveAttribute('max', '2.2');
  });

  it('сдвиг ползунка меняет норму белка, но не калорийность', async () => {
    const { container } = render(<Harness />);

    const readTargets = () => {
      const t = screen.getByText(/ккал · Б/).textContent ?? '';
      return {
        raw: t,
        kcal: Number(t.match(/≈?\s*(\d+) ккал/)?.[1]),
        protein: Number(t.match(/Б\s*(\d+)/)?.[1]),
        carbs: Number(t.match(/У\s*(\d+)/)?.[1]),
      };
    };

    const before = readTargets();
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;

    // fireEvent.change, а не dispatchEvent вручную: React слушает
    // собственный синтетический onChange, и «сырое» событие до него
    // не доходит. Первая версия тестатак проходила впустую —
    // значения не менялись, а проверка «калории не изменились»
    // выполнялась тривиально. Проверка, которая не может упасть,
    // бесполезна, поэтому теперь сверяем и рост белка тоже.
    fireEvent.change(slider, { target: { value: '1.8' } });

    const after = readTargets();
    if (SHOW) {
      console.log('норма до:   ', before.raw);
      console.log('норма после:', after.raw);
    }

    // белок вырос
    expect(after.protein).toBeGreaterThan(before.protein);
    // калорийность не изменилась — в этом весь смысл параметра
    expect(after.kcal).toBe(before.kcal);
    // энергия перераспределена: углеводов стало меньше
    expect(after.carbs).toBeLessThan(before.carbs);
  });
});
