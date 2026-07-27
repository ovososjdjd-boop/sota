/**
 * Запуск произвольного TS-скрипта из src/ без сборки.
 * Vite резолвит импорты так же, как в приложении и тестах —
 * поэтому численные прогоны совпадают с реальным поведением.
 *
 *   node scripts/run.mjs scripts/sim-month.ts
 */
import { createServer } from 'vite';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/run.mjs <file.ts>');
  process.exit(1);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const mod = await server.ssrLoadModule('/' + target.replace(/^\.\//, ''));
  if (typeof mod.default === 'function') await mod.default();
} finally {
  await server.close();
}
