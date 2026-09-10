"""Генератор синтетической выгрузки → data/voc-dashboard.xlsx.

Репозиторий публичный: реальная выгрузка сюда попасть не может
(docs/data-model.md §8), поэтому первый xlsx собирается из выдуманных строк
в структуре §3.

Данные внутренне непротиворечивы: VOC любого среза равен среднему
MARK1_VALUE по его строкам, доли распределения дают ровно 100 %, план
задан так, чтобы бейдж был правдив. Ориентиры макета, которые сами себе
противоречат, не воспроизводятся — V-13, V-14, V-22.

Детерминирован: один и тот же seed и фиксированные метаданные архива дают
байт-в-байт одинаковый файл, иначе тесты и git-диффы не воспроизводимы.
"""

from __future__ import annotations

import argparse
import math
import random
import re
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

from voc_schema import (
    MARKS,
    DICTIONARY_COLUMNS,
    DICTIONARY_SHEET_PREFIX,
    LABELS_COLUMNS,
    LABELS_SHEET,
    PLAN_COLUMNS,
    PLAN_SHEET,
    RATING_COLUMNS,
)

SEED = 20260501
DEFAULT_OUTPUT = Path("data/voc-dashboard.xlsx")

CURRENT_PERIOD = (date(2026, 5, 1), date(2026, 5, 31))
PREVIOUS_PERIOD = (date(2026, 4, 1), date(2026, 4, 30))

# День просадки VOC из requirements 3.2: «21.05 → VOC ↓ → платежи / выписка /
# лояльность ↓». На нём же проверяется смена цвета линии на выходе из коридора.
DIP_DAY = date(2026, 5, 21)

# Метаданные архива фиксированы ради детерминированности файла.
EXTRACT_TIMESTAMP = datetime(2026, 6, 1)
DIP_TRIGGERS = ["Отправка платежа", "Экспорт выписки из раздела", "Программа лояльности"]

# (канал, период, сегмент) → (число оценок, VOC как он должен показаться на карточке).
# АБМ за текущий период — ориентир макета: 10 459 оценок, VOC 4.90.
BLOCKS = [
    ("АБМ", CURRENT_PERIOD, "ММБ", 6240, 4.92),
    ("АБМ", CURRENT_PERIOD, "СБ", 4207, 4.87),
    ("АБМ", CURRENT_PERIOD, "КИБ", 12, 4.83),
    ("АБМ", PREVIOUS_PERIOD, "ММБ", 5900, 4.88),
    ("АБМ", PREVIOUS_PERIOD, "СБ", 3994, 4.83),
    ("АБМ", PREVIOUS_PERIOD, "КИБ", 8, 4.75),
    ("НИБ", CURRENT_PERIOD, "ММБ", 2480, 4.74),
    ("НИБ", CURRENT_PERIOD, "СБ", 1620, 4.66),
    ("НИБ", CURRENT_PERIOD, "КИБ", 18, 4.61),
    ("НИБ", PREVIOUS_PERIOD, "ММБ", 2400, 4.77),
    ("НИБ", PREVIOUS_PERIOD, "СБ", 1567, 4.69),
    ("НИБ", PREVIOUS_PERIOD, "КИБ", 18, 4.72),
]

CHANNEL_CODES = {"АБМ": "ABM", "НИБ": "NIB"}

DICTIONARIES = {
    # Ключ join — пара (канал, триггер): один триггер в двух каналах ведёт к
    # разным КП и продуктам (data-model §3.2). Join только по триггеру даст
    # неверный разрез, и различия ниже — то, на чём эта ошибка проявляется.
    "АБМ": [
        ("Отправка платежа", "Платежи и переводы", "Платежи"),
        ("Подтверждение платежа", "Платежи и переводы", "Платежи"),
        ("Экспорт выписки из раздела", "Отчётность", "Выписки"),
        ("Просмотр выписки", "Отчётность", "Выписки"),
        ("Вход в приложение", "Доступ", "Аутентификация"),
        ("Смена лимитов карты", "Обслуживание карт", "Карты"),
        ("Открытие счёта", "Онбординг", "Расчётный счёт"),
        ("Заявка на кредит", "Кредитование", "Кредиты"),
        ("Обращение в поддержку", "Поддержка", "Поддержка"),
        ("Программа лояльности", "Лояльность", "Лояльность"),
        ("Валютный контроль", "ВЭД", "Валютный контроль"),
        ("Зарплатный проект", "Зарплатный проект", "Зарплата"),
    ],
    "НИБ": [
        ("Отправка платежа", "Платежи (web)", "Платёжное поручение"),
        ("Импорт реестра платежей", "Платежи (web)", "Платёжное поручение"),
        ("Экспорт выписки из раздела", "Документооборот", "Выписки"),
        ("Подписание документа", "Документооборот", "ЭЦП"),
        ("Вход в приложение", "Доступ", "Вход по сертификату"),
        ("Открытие счёта", "Онбординг", "Расчётный счёт"),
        ("Заявка на кредит", "Кредитование", "Кредиты"),
        ("Обращение в поддержку", "Поддержка", "Поддержка"),
        ("Программа лояльности", "Лояльность", "Лояльность"),
        ("Валютный контроль", "ВЭД", "Валютный контроль"),
    ],
}

# Пары триггеров, которые в справочнике сходятся в один продукт: на них
# проверяется обязательная дедупликация по VOC_CCODE внутри группы (§5.2).
COLLAPSING_PAIRS = {
    "АБМ": ("Отправка платежа", "Подтверждение платежа"),
    "НИБ": ("Отправка платежа", "Импорт реестра платежей"),
}

PROBLEMS = {
    "Платежи": [
        ("Ошибка", "Платёж висит в обработке"),
        ("Долго", "Платёж уходит дольше обещанного"),
        ("Непонятно", "Непонятен статус платежа"),
    ],
    "Выписки": [
        ("Ошибка", "Выписка выгружается без НДС"),
        ("Не нашёл", "Не удаётся выгрузить выписку по счёту за период более 30 дней в формате 1С"),
        ("Долго", "Выписка формируется несколько минут"),
    ],
    "Доступ": [
        ("Ошибка", "Не приходит SMS-код"),
        ("Отказ", "Вход блокируется без объяснения причины"),
    ],
    "Карты": [
        ("Не нашёл", "Не нашёл, где менять лимиты"),
        ("Отказ", "Отказ в смене лимита"),
    ],
    "Кредиты": [
        ("Отказ", "Отказ без объяснения причины"),
        ("Долго", "Заявка рассматривается неделю"),
    ],
    "Поддержка": [
        ("Долго", "Оператор отвечает больше часа"),
        ("Непонятно", "Ответ не по существу вопроса"),
    ],
    "Лояльность": [
        ("Непонятно", "Непонятно, как начисляются баллы"),
        ("Отказ", "Баллы не начислились за операцию"),
    ],
    "ВЭД": [
        ("Долго", "Валютный контроль запрашивает документы повторно"),
        ("Непонятно", "Непонятен перечень документов"),
    ],
    "Документооборот": [
        ("Ошибка", "Документ не подписывается ЭЦП"),
        ("Не нашёл", "Не нашёл отправленный документ"),
    ],
}

# Триггер → область (domain) для разметки проблемы.
TRIGGER_DOMAIN = {
    "Отправка платежа": "Платежи",
    "Подтверждение платежа": "Платежи",
    "Импорт реестра платежей": "Платежи",
    "Экспорт выписки из раздела": "Выписки",
    "Просмотр выписки": "Выписки",
    "Вход в приложение": "Доступ",
    "Смена лимитов карты": "Карты",
    "Открытие счёта": "Доступ",
    "Заявка на кредит": "Кредиты",
    "Обращение в поддержку": "Поддержка",
    "Программа лояльности": "Лояльность",
    "Валютный контроль": "ВЭД",
    "Зарплатный проект": "Платежи",
    "Подписание документа": "Документооборот",
}

COMMENTS = {
    1: [
        "Второй день не могу отправить платёж, поддержка молчит.",
        "Всё сломано, работать невозможно.",
    ],
    2: [
        "Работает, но приходится делать лишние шаги.",
        "Долго и непонятно, где искать нужный раздел.",
    ],
    3: [
        "В целом нормально, но есть к чему придраться.",
        "Пользоваться можно, удобства не хватает.",
    ],
    4: [
        "Удобно, но хотелось бы быстрее.",
        "Почти всё устроило, мелкие шероховатости остались.",
    ],
    5: [
        "Всё быстро и понятно, спасибо.",
        "Удобно, ничего лишнего.",
        "Пользуюсь каждый день, вопросов нет.",
    ],
}

LONG_COMMENT = (
    "Выгружаю выписку для бухгалтерии каждый месяц, и каждый раз приходится "
    "делать это в три приёма, потому что за период больше тридцати дней файл "
    "не формируется, а в формате 1С часть операций теряется — из-за этого "
    "сверка занимает лишний день, и это единственное, что меня всерьёз "
    "раздражает в остальном удобном банке."
)

PLAN = [
    # Коридор для АБМ за текущий период содержит 4.90 — бейдж «В плане»
    # правдив (V-13). Пустой сегмент — план на канал целиком.
    ("АБМ", None, CURRENT_PERIOD, 4.85, 4.95),
    ("АБМ", "ММБ", CURRENT_PERIOD, 4.88, 4.96),
    ("АБМ", "СБ", CURRENT_PERIOD, 4.80, 4.90),
    ("АБМ", "КИБ", CURRENT_PERIOD, 4.75, 4.90),
    ("АБМ", None, PREVIOUS_PERIOD, 4.82, 4.90),
    ("АБМ", "ММБ", PREVIOUS_PERIOD, 4.84, 4.92),
    ("АБМ", "СБ", PREVIOUS_PERIOD, 4.78, 4.88),
    ("НИБ", None, CURRENT_PERIOD, 4.70, 4.80),
    ("НИБ", "ММБ", CURRENT_PERIOD, 4.70, 4.82),
    ("НИБ", "СБ", CURRENT_PERIOD, 4.60, 4.72),
    ("НИБ", None, PREVIOUS_PERIOD, 4.70, 4.80),
    # НИБ/КИБ плана не имеет намеренно: на этом срезе проверяется D-04 —
    # бейдж и плановая полоса не рисуются, остальная карточка работает.
]

LABELS = [
    ("канал", "АБМ", "Мобильный банк для бизнеса"),
    ("канал", "НИБ", "Интернет-банк для бизнеса"),
    ("сегмент", "ММБ", "Малый и микробизнес"),
    ("сегмент", "СБ", "Средний бизнес"),
    ("сегмент", "КИБ", "Крупный и инвестиционный бизнес"),
    ("тип проблемы", "Ошибка", "Техническая ошибка"),
    ("тип проблемы", "Не нашёл", "Не нашёл нужное"),
    # Остальные типы проблем подписи не имеют намеренно: на них проверяется
    # D-02 — нет подписи, показываем код.
]


# Форма распределения оценок: доли низких оценок пропорциональны параметру s,
# поэтому среднее линейно по s — mean(s) = 5 − LOW_LOSS·s. Это даёт способ
# задать срезу нужный VOC, не подбирая доли руками.
LOW_SHARES = [0.010, 0.008, 0.018, 0.090]
LOW_LOSS = sum(share * (5 - mark) for share, mark in zip(LOW_SHARES, [1, 2, 3, 4]))
MAX_SCALE = 7.0

DAY_WAVE = 0.06
DIP_DEPTH = 0.30


def shape(target_voc: float) -> list[float]:
    """Веса оценок 1…5, дающие среднее `target_voc`."""
    scale = min(max((5 - target_voc) / LOW_LOSS, 0.0), MAX_SCALE)
    low = [share * scale for share in LOW_SHARES]
    return low + [1 - sum(low)]


def day_target(target_voc: float, day: date) -> float:
    """VOC дня: волна вокруг среднего среза плюс явная просадка на DIP_DAY.

    Волна нужна, чтобы линия графика выходила за плановый коридор в обе
    стороны — иначе смену цвета на выходе из коридора не проверить.
    """
    wave = DAY_WAVE * math.sin(2 * math.pi * (day.toordinal() % 9) / 9)
    dip = DIP_DEPTH if day == DIP_DAY else 0.0
    return target_voc + wave - dip


def solve_marks(days: list[date], target_voc: float, rng: random.Random) -> list[int]:
    """Оценки среза: по одной на каждый слот `days`, со средним, дающим
    `target_voc` при округлении до двух знаков (D-21).

    Сумма подгоняется точно: «примерно то же среднее» на карточке читается
    как ошибка расчёта, а не как свойство тестовых данных.
    """
    count = len(days)
    required_sum = round(target_voc * count)
    if not count <= required_sum <= 5 * count:
        raise ValueError(f"VOC {target_voc} недостижим на {count} оценках")

    marks = [rng.choices(MARKS, weights=shape(day_target(target_voc, day)))[0] for day in days]

    # Остаток после случайной выборки размазывается по строкам циклически,
    # поэтому дневная структура сохраняется, а сумма среза становится точной.
    position = 0
    while sum(marks) != required_sum:
        step = 1 if sum(marks) < required_sum else -1
        for _ in range(count + 1):
            if position >= 4 * count:
                raise ValueError("не удалось подогнать сумму оценок")
            index = position % count
            position += 1
            candidate = marks[index] + step
            if 1 <= candidate <= 5:
                marks[index] = candidate
                break

    actual = round(sum(marks) / count, 2)
    if actual != round(target_voc, 2):
        raise ValueError(f"среднее среза {actual} вместо {target_voc}")
    return marks


def day_weights(period: tuple[date, date]) -> list[tuple[date, float]]:
    """Оценки по дням: в выходные их заметно меньше, чем в будни."""
    start, end = period
    days = []
    day = start
    while day <= end:
        weight = 0.25 if day.weekday() >= 5 else 1.0
        days.append((day, weight))
        day += timedelta(days=1)
    return days


def allocate_days(count: int, period: tuple[date, date]) -> list[date]:
    """Распределяет `count` оценок по дням периода методом наибольших остатков.

    Каждый календарный день получает хотя бы одну оценку — иначе в графике
    появятся дыры, которых в выгрузке за месяц не бывает.
    """
    days = day_weights(period)
    if count < len(days):
        return [days[index * len(days) // count][0] for index in range(count)]

    total_weight = sum(weight for _, weight in days)
    exact = [(count - len(days)) * weight / total_weight for _, weight in days]
    counts = [1 + int(value) for value in exact]
    remainders = sorted(
        range(len(days)), key=lambda index: (-(exact[index] - int(exact[index])), index)
    )
    for index in remainders[: count - sum(counts)]:
        counts[index] += 1

    result: list[date] = []
    for (day, _), day_count in zip(days, counts):
        result.extend([day] * day_count)
    return result


def build_ratings(rng: random.Random) -> dict[str, list[list[object]]]:
    sheets: dict[str, list[list[object]]] = {channel: [] for channel in DICTIONARIES}
    counters = {channel: 0 for channel in DICTIONARIES}

    for channel, period, segment, count, target_voc in BLOCKS:
        triggers = [trigger for trigger, _, _ in DICTIONARIES[channel]]
        collapsing = COLLAPSING_PAIRS[channel]
        days = allocate_days(count, period)
        marks = solve_marks(days, target_voc, rng)

        for index, (day, mark) in enumerate(zip(days, marks)):
            counters[channel] += 1
            sheets[channel].append(
                _rating_row(
                    channel, segment, day, mark, index, counters[channel], triggers, collapsing, rng
                )
            )

    for channel in sheets:
        sheets[channel].sort(key=lambda row: (row[1], row[0]))
    return sheets


def _rating_row(channel, segment, day, mark, index, counter, triggers, collapsing, rng):
    code = f"{CHANNEL_CODES[channel]}-{day:%Y%m}-{counter:06d}"

    if index % 23 == 0:
        # Триггеры, сходящиеся в один продукт: оценка обязана посчитаться
        # в продукте один раз (§5.2).
        operations = list(collapsing)
    elif index % 11 == 0:
        operations = rng.sample(triggers, 2)
    elif index % 37 == 0:
        operations = rng.sample(triggers, 3)
    else:
        operations = [rng.choice(triggers)]
    if day == DIP_DAY and mark <= 3:
        operations = [trigger for trigger in DIP_TRIGGERS if trigger in triggers][: 1 + index % 2]

    # Разметка идёт за комментарием: без прямой речи размечать нечего, поэтому
    # такие оценки попадают в группу «Без разметки» (D-11).
    comment = None
    domain = None
    problem_type = None
    problem = None
    if mark <= 4 or index % 3 == 0:
        comment = LONG_COMMENT if index % 401 == 0 else rng.choice(COMMENTS[mark])
        domain = TRIGGER_DOMAIN.get(operations[0], "Поддержка")
        if mark <= 4 and index % 13 != 0:
            problem_type, problem = rng.choice(PROBLEMS[domain])

    expertise = None
    if index % 17 == 0:
        expertise = f"Экспертиза оператора: обращение отнесено к теме «{operations[0]}»."

    answer_date = day + timedelta(days=index % 3)
    return [
        code,
        day,
        answer_date,
        channel,
        segment,
        ";".join(operations),
        mark,
        comment,
        expertise,
        domain,
        problem_type,
        problem,
    ]


def write_workbook(path: Path, ratings: dict[str, list[list[object]]]) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    workbook = Workbook()
    workbook.remove(workbook.active)
    header_font = Font(bold=True)

    def add_sheet(title: str, columns: list[str], rows) -> None:
        sheet = workbook.create_sheet(title)
        sheet.append(columns)
        for cell in sheet[1]:
            cell.font = header_font
        sheet.freeze_panes = "A2"
        for row in rows:
            sheet.append(row)

    for channel, rows in ratings.items():
        add_sheet(channel, RATING_COLUMNS, rows)
    for channel, entries in DICTIONARIES.items():
        add_sheet(DICTIONARY_SHEET_PREFIX + channel, DICTIONARY_COLUMNS, entries)
    add_sheet(
        PLAN_SHEET,
        PLAN_COLUMNS,
        [
            [channel, segment, period[0], period[1], minimum, maximum]
            for channel, segment, period, minimum, maximum in PLAN
        ],
    )
    add_sheet(LABELS_SHEET, LABELS_COLUMNS, LABELS)

    for sheet in workbook.worksheets:
        for column, width in zip("ABCDEFGHIJKL", (22, 13, 13, 14, 20, 46, 12, 60, 60, 16, 16, 46)):
            sheet.column_dimensions[column].width = width

    workbook.properties.created = workbook.properties.modified = EXTRACT_TIMESTAMP
    workbook.properties.creator = workbook.properties.lastModifiedBy = "tools/make_sample_data.py"
    path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(path)
    _freeze_archive(path)


def _freeze_archive(path: Path) -> None:
    """Убирает из файла время прогона: openpyxl ставит текущее время в записи
    zip и в `dcterms:modified`, поэтому без этого два прогона дают разные
    байты и xlsx шумит в git при каждой перегенерации."""
    source = zipfile.ZipFile(path)
    entries = [(info, source.read(info.filename)) for info in source.infolist()]
    source.close()

    stamp = EXTRACT_TIMESTAMP.strftime("%Y-%m-%dT%H:%M:%SZ").encode()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as target:
        for info, payload in entries:
            if info.filename == "docProps/core.xml":
                payload = re.sub(
                    rb"(<dcterms:modified[^>]*>)[^<]*(</dcterms:modified>)",
                    rb"\g<1>" + stamp + rb"\g<2>",
                    payload,
                )
            frozen = zipfile.ZipInfo(info.filename, date_time=(1980, 1, 1, 0, 0, 0))
            frozen.compress_type = zipfile.ZIP_DEFLATED
            frozen.external_attr = info.external_attr
            target.writestr(frozen, payload)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    rng = random.Random(SEED)
    ratings = build_ratings(rng)
    write_workbook(arguments.out, ratings)

    total = sum(len(rows) for rows in ratings.values())
    print(f"{arguments.out}: {total} оценок, {arguments.out.stat().st_size / 1024:.0f} КБ")
    for channel, rows in ratings.items():
        print(f"  {channel}: {len(rows)}")


if __name__ == "__main__":
    main()
