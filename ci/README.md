# Непрерывная интеграция

`github-actions.yml` — готовый workflow: проверка типов, линтер,
68 тестов, сборка и контроль, что `highs.wasm` попал в `dist`.

**Как включить:** скопируйте файл в `.github/workflows/ci.yml`
и закоммитьте.

```bash
mkdir -p .github/workflows
cp ci/github-actions.yml .github/workflows/ci.yml
git add .github && git commit -m "ci: включить проверки"
```

Отдельным коммитом это нужно потому, что создание workflow требует
права `workflows`, которого нет у автоматизации.

Локально те же проверки:

```bash
cd app && npm run typecheck && npm run lint && npm test && npm run build
```
