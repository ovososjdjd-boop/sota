import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Офлайн-режим: регистрируем service worker после загрузки страницы,
// чтобы не конкурировать за сеть с первой отрисовкой.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // офлайн-режим необязателен: приложение работает и без него
    });
  });
}
