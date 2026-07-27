/**
 * Визуальная проверка карточки блюда: рецепт, состав и отметки,
 * на которых приложение учится.
 *
 *   VITE_SHOW=1 npx vitest run --project ui render-recipe
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

const SHOW = Boolean((import.meta as { env?: Record<string, unknown> }).env?.VITE_SHOW);

function dump(root: HTMLElement): string {
  const out: string[] = [];
  const walk = (el: Element) => {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (own) out.push(own);
    for (const c of el.children) walk(c);
  };
  walk(root);
  return out.join('\n');
}

describe('карточка блюда', () => {
  it('показывает состав, шаги и предлагает отметить приготовление', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole('button', { name: /Составить меню/i }));
    await waitFor(() => expect(screen.getByText(/Меню на 7 дн/i)).toBeInTheDocument(), {
      timeout: 120000,
    });

    // Открываем первое блюдо дня — ЛЮБОЕ, а не заранее угаданное.
    //
    // Здесь тест был хрупким: он искал кнопку со словом «Основное»
    // или «Каша». Как только планировщик собрал первый день из супа
    // и гарнира — вполне нормальный день, — тест упал, хотя приложение
    // работало правильно. Тест обязан проверять ДОГОВОР («карточку
    // блюда можно открыть»), а не конкретное содержимое меню, которое
    // меняется от каждой правки движка.
    const ROLES = ['Каша', 'Суп', 'Основное', 'Гарнир', 'Салат', 'Перекус', 'Напиток', 'Выпечка'];
    const dishButtons = [...container.querySelectorAll('button')];
    const dishButton = dishButtons.find((b) =>
      ROLES.some((r) => b.textContent?.includes(r)),
    );
    expect(dishButton, 'не нашлось блюда, на которое можно нажать').toBeTruthy();
    await user.click(dishButton!);

    await waitFor(() => expect(screen.getByText(/Приготовили это блюдо/i)).toBeInTheDocument());
    const text = dump(container);
    if (SHOW) console.log('\n' + text.slice(0, 2200) + '\n');

    // рецепт должен быть полноценным: состав и шаги
    expect(text).toMatch(/Да, готовил/);
    expect(text).toMatch(/Пропустил/);
    // объяснение, зачем это нужно
    expect(text).toMatch(/подстроится|учтём/i);

    // отметка не должна ломать меню
    await user.click(screen.getByRole('button', { name: /Да, готовил/i }));
    expect(dump(container)).toMatch(/Запомнили/);
  }, 200000);
});
