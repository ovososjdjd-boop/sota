/**
 * Визуальная проверка календаря меню.
 * Смотрим на карточку дня так, как её увидит человек.
 *
 *   VITE_SHOW=1 npx vitest run --project ui render-menu
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

const SHOW = Boolean((import.meta as { env?: Record<string, unknown> }).env?.VITE_SHOW);

function dump(root: HTMLElement): string {
  const out: string[] = [];
  const walk = (el: Element, depth: number) => {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (own) out.push(`${'  '.repeat(Math.min(depth, 5))}${own}`);
    for (const c of el.children) walk(c, own ? depth + 1 : depth);
  };
  walk(root, 0);
  return out.join('\n');
}

describe('календарь меню', () => {
  it('в карточке дня видны граммовка порции и калории', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole('button', { name: /Составить меню/i }));
    await waitFor(() => expect(screen.getByText(/Меню на 7 дн/i)).toBeInTheDocument(), {
      timeout: 120000,
    });

    const text = dump(container);
    if (SHOW) console.log('\n' + text.slice(0, 2500) + '\n');

    // граммовка порции — отзыв: «в меню не видно граммовки, только ккал»
    expect(text).toMatch(/\d+\s*г|\d+(\.\d+)?\s*кг/);
    // подсказки о запасе не должны звучать как ошибка
    expect(text).not.toMatch(/не поместились в расписание/);
  }, 200000);
});
