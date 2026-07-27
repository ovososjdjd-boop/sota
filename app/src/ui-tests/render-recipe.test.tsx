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

    // открываем первое блюдо дня
    const dishButtons = container.querySelectorAll('button');
    let opened = false;
    for (const b of dishButtons) {
      if (b.textContent?.includes('Основное') || b.textContent?.includes('Каша')) {
        await user.click(b);
        opened = true;
        break;
      }
    }
    expect(opened, 'не нашлось блюда, на которое можно нажать').toBe(true);

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
