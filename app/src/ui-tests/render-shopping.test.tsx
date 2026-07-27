/**
 * Визуальная проверка экрана покупок с волнами.
 * Смотрим глазами на текст, который увидит человек.
 *
 *   VITE_SHOW=1 npx vitest run --project ui render-shopping
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
    if (own) out.push(`${'  '.repeat(Math.min(depth, 6))}${own}`);
    for (const c of el.children) walk(c, own ? depth + 1 : depth);
  };
  walk(root, 0);
  return out.join('\n');
}

describe('экран покупок: закупка волнами', () => {
  it('на месячном плане список разбит на походы в магазин', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const { container } = render(<App />);

    // месяц вместо недели — волны имеют смысл только на длинном периоде
    await user.click(screen.getByRole('button', { name: 'Месяц' }));
    // Бюджет по умолчанию (5000 ₽) рассчитан на неделю; на месяц его
    // не хватает, и приложение честно об этом сообщает вместо меню.
    const budgetInput = screen.getByPlaceholderText('5 000');
    await user.clear(budgetInput);
    await user.type(budgetInput, '15000');
    await user.click(screen.getByRole('button', { name: /Составить меню/i }));
    await waitFor(() => expect(screen.getByText(/Меню на 30 дн/i)).toBeInTheDocument(), {
      timeout: 120000,
    });

    await user.click(screen.getByRole('button', { name: /Покупки/i }));
    await waitFor(() => expect(screen.getByText(/К оплате/i)).toBeInTheDocument(), {
      timeout: 60000,
    });

    const text = dump(container);
    if (SHOW) console.log('\n' + text.slice(0, 3000) + '\n');

    // походы пронумерованы и показывают, когда идти и сколько взять денег
    expect(text).toMatch(/Поход 1/);
    expect(text).toMatch(/Поход 2/);
    expect(text).toMatch(/день 8/);
    // объяснение человеческим языком, а не «волна №2»
    expect(text).toMatch(/покупки на .* дн/i);
    // возможность вернуться к общему списку
    expect(text).toMatch(/Всё сразу/);
  }, 200000);
});
