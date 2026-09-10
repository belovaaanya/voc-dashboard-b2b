# Дашборд VOC для PO B2B

Статическая страница на GitHub Pages, свёрстанная по макету из Figma. Данные
дашборд читает из файлов, которые лежат рядом с сайтом; backend отсутствует.

Дашборд отвечает не на вопрос «какой VOC», а на вопрос **«почему он такой»** —
связывает динамику метрики, антидрайверы и события в одну историю.

**Статус:** собраны требования и дизайн-спека, реализация не начата.
Текущее состояние — [PROGRESS.md](PROGRESS.md).

---

## Документация

| Документ | О чём |
| --- | --- |
| [docs/requirements.md](docs/requirements.md) | Что должен делать дашборд, приоритеты P0/P1/P2, открытые вопросы |
| [docs/decisions.md](docs/decisions.md) | Решения по умолчанию (`D-xx`) с условиями пересмотра |
| [docs/design-validation.md](docs/design-validation.md) | Где макет нельзя воспроизводить и что делать вместо этого (`V-xx`) |
| [docs/design-spec.md](docs/design-spec.md) | Замеры сетки и блоков, палитра |
| [docs/data-model.md](docs/data-model.md) | Структура выгрузки, что из чего считается, подводные камни |
| [docs/figma-sources.md](docs/figma-sources.md) | Node ID, доступы, как перечитать макет |
| [docs/slice-gate.md](docs/slice-gate.md) | Проверка в конце каждого слайса |
| [CLAUDE.md](CLAUDE.md) | Рабочие правила репозитория |

Начинать чтение с `requirements.md`, перед вёрсткой любого блока —
`design-validation.md` и `decisions.md`.

---

## Структура

```
.
├── docs/                  требования, спека, модель данных
│   └── design/reference/  экспорт макета 1:1 для сверки без Figma
├── site/                  то, что публикуется на Pages
│   └── data/              JSON, генерируется из xlsx (не в git)
├── data/                  xlsx — source of truth (появится на этапе 1)
├── tools/                 генератор и конвертер данных (появятся на этапе 1)
└── PROGRESS.md            чеклист по всей задаче
```

---

## Данные

`xlsx` правит аналитик, браузер читает JSON:

```
data/voc-dashboard.xlsx  ──tools/xlsx_to_json.py──▶  site/data/*.json
        (в git)                                        (артефакт)
```

Разбор xlsx вынесен в deploy, потому что parser для `.xlsx` весит больше, чем
все данные дашборда, а сами данные меняются редко и одинаковы для всех.
Подробно — [docs/data-model.md](docs/data-model.md).

---

## Стек

**Без framework и без bundler** — ES-модули, CSS custom properties, данные
через `fetch` JSON. Обоснование:

- дашборд — один экран с сильно кастомной графикой; framework здесь почти
  ничего не переиспользует;
- график (плановый коридор, линия, меняющая цвет при переходе через коридор,
  подписи на точках) проще нарисовать своим SVG, чем перекрашивать chart-библиотеку,
  поэтому chart-зависимость тоже не нужна;
- Pages деплоит `site/` как есть, единственный tooling — конвертер данных.

Если понадобится TypeScript или сборка токенов, добавляется Vite — deploy
меняется на одну сборочную step.

---

## Deploy

Опубликовано: **https://belovaaanya.github.io/voc-dashboard-b2b/**

Содержимое `site/` публикуется при push в `main` —
[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml),
source в настройках Pages — GitHub Actions.

Репозиторий публичный: на бесплатном плане Pages для private-репозитория
недоступен, а публикация страницы была нужна.
