# Приложение «Ратион»

Клиентская часть. Документация проекта — в корневом [README](../README.md).

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # все тесты
npm run test:engine    # только движок
npm run test:ui        # только интерфейс
npm run build          # production PWA в dist/
```

## Структура

```
src/
├── core/          движок: типы, нормы, меры, кулинария, оптимизатор
│   └── __tests__/ тесты движка (56)
├── data/          база продуктов с ценами и мерами
├── screens/       Onboarding · Plan · Shopping · Settings
├── state/         состояние + localStorage
├── ui/            переиспользуемые компоненты
└── ui-tests/      тесты интерфейса в jsdom (13)
```

`public/highs.wasm` — солвер HiGHS, обязателен для работы оптимизатора.
