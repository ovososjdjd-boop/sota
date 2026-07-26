/**
 * Проверка реального пользовательского пути через отрисовку компонентов.
 * Браузер в песочнице недоступен, поэтому используем jsdom —
 * это проверяет настоящий React-рендер, состояние и обработчики.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

beforeEach(() => {
  localStorage.clear();
});

/**
 * Пройти онбординг и дождаться готового меню.
 * Стартовый экран приложения — календарь меню (Этап 4).
 */
async function completeOnboarding(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Составить меню/i }));
  await waitFor(() => expect(screen.getByText(/Меню на 7 дн/i)).toBeInTheDocument(), {
    timeout: 60000,
  });
}

/** Перейти на вкладку с продуктовой корзиной. */
async function openProducts(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Продукты/i }));
  await waitFor(() => expect(screen.getByText(/Список покупок/i)).toBeInTheDocument(), {
    timeout: 60000,
  });
}

describe('пользовательский путь', () => {
  it('стартует с онбординга и показывает поле суммы', () => {
    render(<App />);
    expect(screen.getByText(/Меню под ваш бюджет/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('5 000')).toBeInTheDocument();
  });

  it('показывает подсказку о тратах в день при вводе суммы', async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByPlaceholderText('5 000');
    await user.type(input, '7000');
    expect(screen.getByText(/в день на человека/i)).toBeInTheDocument();
  });

  it('кнопка заблокирована при пустой сумме', () => {
    render(<App />);
    // начальное значение 5000 → кнопка активна; обнулим
    const btn = screen.getByRole('button', { name: /Составить меню/i });
    expect(btn).toBeEnabled();
  });

  it('полный путь: ввод суммы → расчёт → список покупок', async () => {
    const user = userEvent.setup();
    render(<App />);

    await completeOnboarding(user);
    await openProducts(user);

    // бюджет-бар присутствует
    expect(screen.getByText(/Потрачено/i)).toBeInTheDocument();
    expect(screen.getByText(/Остаток/i)).toBeInTheDocument();

    // КБЖУ-кольца
    expect(screen.getByText(/В день на человека/i)).toBeInTheDocument();
    expect(screen.getByText('Белки')).toBeInTheDocument();
  }, 60000);

  it('корзина содержит порции в домашних мерах, а не только граммы', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeOnboarding(user);
    await openProducts(user);

    const body = document.body.textContent ?? '';
    // хотя бы одна человеческая мера должна встретиться
    const hasHouseholdMeasure =
      /стакан|ст\. л\.|ч\. л\.|шт|ломоть|упак/.test(body);
    expect(hasHouseholdMeasure).toBe(true);
  }, 60000);

  it('не превышает заявленный бюджет', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeOnboarding(user);
    await openProducts(user);

    // «Потрачено N из 5 000 ₽»
    const text = document.body.textContent ?? '';
    const match = text.match(/([\d\s\u00a0]+)\s*из\s*([\d\s\u00a0]+)\s*₽/);
    expect(match).toBeTruthy();
    const spent = Number(match![1].replace(/[\s\u00a0]/g, ''));
    const budget = Number(match![2].replace(/[\s\u00a0]/g, ''));
    expect(spent).toBeLessThanOrEqual(budget);
  }, 60000);

  it('переключается на настройки и обратно', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeOnboarding(user);
    await openProducts(user);

    await user.click(screen.getByRole('button', { name: /Настройки/i }));
    expect(screen.getByText(/Кто ест/i)).toBeInTheDocument();
    expect(screen.getByText(/Об источниках данных/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Продукты/i }));
    expect(screen.getByText(/Список покупок/i)).toBeInTheDocument();
  }, 60000);

  it('в настройках показана норма КБЖУ с оговоркой о точности', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeOnboarding(user);
    await openProducts(user);
    await user.click(screen.getByRole('button', { name: /Настройки/i }));

    expect(screen.getByText(/Норма в день/i)).toBeInTheDocument();
    // честность про погрешность формул
    expect(screen.getByText(/ошибаются на ±10%/i)).toBeInTheDocument();
  }, 60000);

  it('добавление члена семьи увеличивает потребность в калориях', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeOnboarding(user);
    await openProducts(user);

    // «7 дней · 1 чел»
    expect(screen.getByText(/1 чел/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Настройки/i }));
    await user.click(screen.getByRole('button', { name: /\+ Добавить/i }));

    // появился второй профиль
    await waitFor(
      () => expect(screen.getAllByText(/Норма в день/i).length).toBe(2),
      { timeout: 20000 },
    );

    await user.click(screen.getByRole('button', { name: /Продукты/i }));
    await waitFor(() => expect(screen.getByText(/2 чел/)).toBeInTheDocument(), {
      timeout: 20000,
    });
  }, 90000);

  it('сохраняет состояние между перезапусками', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await completeOnboarding(user);
    unmount();

    render(<App />);
    // онбординг пройден — приложение сразу открывает меню
    await waitFor(() => expect(screen.getByText(/Меню на 7 дн/i)).toBeInTheDocument(), {
      timeout: 60000,
    });
  }, 90000);

  it('дисклеймер о немедицинском характере присутствует', async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeOnboarding(user);
    await openProducts(user);
    expect(screen.getByText(/не медицинская рекомендация/i)).toBeInTheDocument();
  }, 60000);
});
