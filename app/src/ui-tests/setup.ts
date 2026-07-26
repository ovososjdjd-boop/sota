import '@testing-library/jest-dom/vitest';

// jsdom не реализует эти API, а компоненты их используют
if (typeof window !== 'undefined') {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as never;

  window.confirm = () => true;
}

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Без этого DOM накапливается между тестами и появляются дубли элементов
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});
