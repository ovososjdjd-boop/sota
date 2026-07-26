# Численные эксперименты

Воспроизводимые проверки ключевых инженерных гипотез проекта.

## Запуск

```bash
npm install highs
node experiments/01-portions-household-units.mjs
node experiments/02-two-stage-scaling.mjs
node experiments/03-naive-scaling.mjs
```

## Что проверено

| Файл | Вопрос | Результат |
|---|---|---|
| `01-portions-household-units.mjs` | Сколько точности теряем, отказавшись от весов? | **0.01 п.п.** — отказ практически бесплатен |
| `03-naive-scaling.mjs` | Тянет ли прямой MILP большую базу? | Нет: 5000 продуктов = 21 с |
| `02-two-stage-scaling.mjs` | Спасает ли двухэтапная схема LP→MILP? | Да: **65× ускорение**, потеря 0.04% |

Разбор результатов: [`docs/research/RESEARCH.md`](../docs/research/RESEARCH.md)
