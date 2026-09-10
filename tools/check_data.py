"""Проверка выгрузки. Падает при нарушении любого инварианта.

Инварианты разделены на две группы, и это не косметика: `check_data.py` стоит
блокирующим шагом публикации.

- **выгрузка** — свойства, которые обязаны держаться на любом файле, включая
  реальную выгрузку: схема, ключи, диапазоны, join по справочнику;
- **сэмпл** (`--sample`) — обещания [data-model §9](../docs/data-model.md#9-тестовые-данные):
  ориентиры карточек, покрытие периода, наличие ловушек. На реальной выгрузке
  они бессмысленны и без флага не запускаются.

Ориентиры макета заданы здесь константами, а не читаются из генератора:
расхождение генератора с тем, что показывает карточка, обязано всплывать тут,
а не в браузере.

Каждая проверка печатает свой код — по нему на неё ссылаются тесты и PR.
"""

from __future__ import annotations

import argparse
import calendar
import math
import sys
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

from voc_schema import MARKS, SEGMENTS, Extract, SchemaError, load

DEFAULT_SOURCE = Path("data/voc-dashboard.xlsx")

ANCHOR_CHANNEL = "АБМ"
ANCHOR_PERIOD = "2026-05"
PREVIOUS_PERIOD = "2026-04"
ANCHOR_VOC = 4.90
ANCHOR_COUNT = 10459

# Просадка дня и разрезы, которыми она обязана объясняться (requirements 3.2).
DIP_DAY = "2026-05-21"
DIP_PRODUCTS = ["Платежи", "Выписки", "Лояльность"]
DIP_MARGIN = 0.005

SAMPLE_PRECISION = 0.1
SHARE_DIGITS = 1

MIN_MULTI_OPERATION_SHARE = 0.05
MIN_BLANK_MARKUP_SHARE = 0.05
MIN_ANTIDRIVER_DROP = 0.05
MIN_LONG_COMMENT = 200


def period_of(rating) -> str:
    return rating.appeal_date.strftime("%Y-%m") if rating.appeal_date else "?"


def numeric(rows) -> list:
    return [row for row in rows if isinstance(row.mark, int) and row.mark in MARKS]


def voc(rows) -> float:
    return sum(row.mark for row in rows) / len(rows)


def shown(value: float) -> float:
    return round(value, 2)


def slice_rows(extract: Extract, channel=None, period=None, segment=None) -> list:
    return [
        rating
        for rating in numeric(extract.ratings)
        if (channel is None or rating.channel == channel)
        and (period is None or period_of(rating) == period)
        and (segment is None or rating.segment == segment)
    ]


def shares(counts: Counter, total: int, digits: int) -> dict[int, float]:
    """Доли оценок в том виде, в каком их покажет UI: метод наибольших
    остатков, сумма ровно 100 (`D-40`)."""
    scale = 10**digits
    exact = {mark: counts[mark] * 100 * scale / total for mark in MARKS}
    result = {mark: int(value) for mark, value in exact.items()}
    order = sorted(exact, key=lambda mark: (-(exact[mark] - result[mark]), mark))
    for mark in order[: 100 * scale - sum(result.values())]:
        result[mark] += 1
    return {mark: value / scale for mark, value in result.items()}


def products_of(extract: Extract, rating) -> set[str]:
    """Продукты оценки: триггеры через справочник, дедуплицированные —
    несколько триггеров могут сойтись в один продукт (§5.2)."""
    mapping = extract.dictionaries.get(rating.channel, {})
    return {mapping[trigger][1] for trigger in rating.operations if trigger in mapping}


def product_voc(extract: Extract, rows: list, product: str) -> tuple[int, float | None]:
    group = [rating for rating in rows if product in products_of(extract, rating)]
    return len(group), voc(group) if group else None


# --- свойства любой выгрузки -------------------------------------------------


def check_channel_sheets(extract: Extract) -> list[str]:
    """Имя листа оценок — это канал: иначе справочник канала подцепится не к
    тем строкам (§3)."""
    problems = []
    by_sheet = defaultdict(set)
    for rating in extract.ratings:
        by_sheet[rating.sheet].add(rating.channel)
    for sheet, channels in sorted(by_sheet.items()):
        if channels != {sheet}:
            problems.append(f"лист «{sheet}»: CHANNEL_NAME = {sorted(channels)}")
    for channel in extract.channels:
        if channel not in extract.dictionaries:
            problems.append(f"канал «{channel}»: нет листа «Справочник {channel}»")
    return problems


def check_required_fields(extract: Extract) -> list[str]:
    problems = []
    for rating in extract.ratings:
        where = f"{rating.sheet}:{rating.row}"
        if not rating.voc_ccode:
            problems.append(f"{where}: пустой VOC_CCODE")
        if rating.appeal_date is None:
            problems.append(f"{where}: пустой или нечитаемый APPEAL_DATE")
        if not rating.channel:
            problems.append(f"{where}: пустой CHANNEL_NAME")
        if rating.segment not in SEGMENTS:
            problems.append(f"{where}: CLIENTSEGMENT_CCODE = «{rating.segment}»")
        if not rating.operations:
            problems.append(f"{where}: пустой OPERATION_NAME")
        # ANSWER_DATE не требуется: обращение без ответа — штатный случай, а в
        # JSON поле не попадает (D-06).
        if rating.answer_date and rating.appeal_date and rating.answer_date < rating.appeal_date:
            problems.append(f"{where}: ANSWER_DATE раньше APPEAL_DATE")
    return problems


def check_ccode_unique(extract: Extract) -> list[str]:
    """VOC_CCODE — ключ дедупликации в неаддитивных разрезах (§5.2)."""
    counts = Counter(rating.voc_ccode for rating in extract.ratings)
    return [
        f"VOC_CCODE «{code}» встречается {count} раз"
        for code, count in counts.items()
        if count > 1
    ]


def check_mark_range(extract: Extract) -> list[str]:
    problems = []
    for rating in extract.ratings:
        if type(rating.mark) is not int or rating.mark not in MARKS:
            problems.append(f"{rating.sheet}:{rating.row}: MARK1_VALUE = {rating.mark!r}")
    return problems


def check_distribution(extract: Extract) -> list[str]:
    """Доли распределения оценок 1–5 обязаны давать ровно 100 %.

    Знаменатель — все строки среза, а числитель — только оценки 1…5: иначе
    оценка, вышедшая из диапазона, выпала бы из расчёта вместе со своим
    вкладом в 100 %, и нарушение стало бы ненаблюдаемым.
    """
    problems = []
    slices = defaultdict(list)
    for rating in extract.ratings:
        slices[(rating.channel, period_of(rating))].append(rating)
    for (channel, period), rows in sorted(slices.items()):
        counts = Counter(row.mark for row in rows)
        covered = sum(counts[mark] for mark in MARKS)
        total = sum((Fraction(counts[mark], len(rows)) for mark in MARKS), Fraction(0))
        if total != 1:
            problems.append(
                f"{channel} {period}: доли 1–5 дают {float(total) * 100:.2f} % "
                f"({covered} оценок из {len(rows)})"
            )
    return problems


def check_dictionary_join(extract: Extract) -> list[str]:
    """Триггер без пары в справочнике своего канала (`D-12`)."""
    unmapped = set()
    for rating in extract.ratings:
        mapping = extract.dictionaries.get(rating.channel, {})
        for trigger in rating.operations:
            if trigger not in mapping:
                unmapped.add((rating.channel, trigger))
    return [
        f"{channel}: триггер «{trigger}» отсутствует в справочнике"
        for channel, trigger in sorted(unmapped)
    ]


def check_plan_rows(extract: Extract) -> list[str]:
    """Строка плана обязана быть заполнена целиком и осмысленно.

    Выход факта за коридор ошибкой не является — это штатное состояние
    бейджа, поэтому здесь проверяется только сама строка.
    """
    problems = []
    for row in extract.plan:
        if row.period_from is None or row.period_to is None:
            problems.append(f"plan:{row.row}: пустой или нечитаемый период")
            continue
        if row.period_from > row.period_to:
            problems.append(f"plan:{row.row}: период кончается раньше, чем начинается")
        if not isinstance(row.minimum, (int, float)) or not isinstance(row.maximum, (int, float)):
            problems.append(f"plan:{row.row}: min/max не число ({row.minimum!r}, {row.maximum!r})")
            continue
        if row.minimum > row.maximum:
            problems.append(f"plan:{row.row}: min {row.minimum} больше max {row.maximum}")
        if row.segment is not None and row.segment not in SEGMENTS:
            problems.append(f"plan:{row.row}: сегмент «{row.segment}»")
        if row.channel not in extract.channels:
            problems.append(f"plan:{row.row}: канал «{row.channel}» не встречается в оценках")
    return problems


def check_labels(extract: Extract) -> list[str]:
    seen = set()
    problems = []
    for row in extract.labels:
        if not row.dimension or not row.code:
            problems.append(f"labels:{row.row}: пустое измерение или код")
        elif (row.dimension, row.code) in seen:
            problems.append(
                f"labels:{row.row}: подпись для ({row.dimension}, {row.code}) уже задана"
            )
        seen.add((row.dimension, row.code))
    return problems


# --- обещания сэмпла (data-model §9) ----------------------------------------


def check_voc_anchor(extract: Extract) -> list[str]:
    rows = slice_rows(extract, ANCHOR_CHANNEL, ANCHOR_PERIOD)
    if not rows:
        return [f"нет оценок {ANCHOR_CHANNEL} за {ANCHOR_PERIOD}"]
    problems = []
    if len(rows) != ANCHOR_COUNT:
        problems.append(f"оценок {len(rows)}, ориентир карточки {ANCHOR_COUNT}")
    if shown(voc(rows)) != ANCHOR_VOC:
        problems.append(f"VOC {shown(voc(rows))}, ориентир карточки {ANCHOR_VOC}")
    return problems


def check_distribution_card(extract: Extract) -> list[str]:
    """Распределение, показанное с точностью `D-40`, обязано воспроизводить
    VOC карточки — это и есть содержание `V-22`.

    Целыми процентами это недостижимо: они дают среднее на 0.01–0.02 ниже
    карточки, то есть ровно тот дефект макета, от которого `V-22` уводит.
    """
    problems = []
    for channel in extract.channels:
        for period in (ANCHOR_PERIOD, PREVIOUS_PERIOD):
            rows = slice_rows(extract, channel, period)
            if not rows:
                continue
            counts = Counter(row.mark for row in rows)
            table = shares(counts, len(rows), SHARE_DIGITS)
            if round(sum(table.values()), 6) != 100:
                problems.append(f"{channel} {period}: доли дают {sum(table.values())} %")
            implied = shown(sum(mark * share for mark, share in table.items()) / 100)
            if implied != shown(voc(rows)):
                problems.append(
                    f"{channel} {period}: распределение даёт {implied}, карточка {shown(voc(rows))}"
                )
    return problems


def check_period_coverage(extract: Extract) -> list[str]:
    """Диапазон дат покрывает текущий период и предыдущий аналогичный целиком,
    иначе не проверить сравнение периодов и не построить ось без дыр."""
    problems = []
    covered = defaultdict(set)
    for rating in numeric(extract.ratings):
        covered[(rating.channel, period_of(rating))].add(rating.appeal_date)
    for channel in extract.channels:
        for period in (ANCHOR_PERIOD, PREVIOUS_PERIOD):
            days = covered.get((channel, period), set())
            if not days:
                problems.append(f"{channel}: нет оценок за {period}")
                continue
            year, month = (int(part) for part in period.split("-"))
            length = calendar.monthrange(year, month)[1]
            if len(days) != length:
                problems.append(f"{channel} {period}: заполнено {len(days)} дней из {length}")
    return problems


def check_delta_signs(extract: Extract) -> list[str]:
    """Дельты обязаны быть разными: и по знаку между каналами, и между
    сегментами внутри канала.

    Одинаковая дельта во всех карточках — вид заглушки макета, на котором
    ошибка «рисуем дельту канала в каждой карточке» неотличима от правды.
    """
    problems = []
    channel_deltas = {}
    for channel in extract.channels:
        current = slice_rows(extract, channel, ANCHOR_PERIOD)
        previous = slice_rows(extract, channel, PREVIOUS_PERIOD)
        if not current or not previous:
            continue
        channel_deltas[channel] = shown(voc(current) - voc(previous))

        segment_deltas = {}
        for segment in SEGMENTS:
            here = slice_rows(extract, channel, ANCHOR_PERIOD, segment)
            there = slice_rows(extract, channel, PREVIOUS_PERIOD, segment)
            if here and there:
                segment_deltas[segment] = shown(voc(here) - voc(there))
        values = list(segment_deltas.values())
        if len(values) > 1 and len(set(values)) != len(values):
            problems.append(f"{channel}: дельты сегментов совпадают — {segment_deltas}")
        if any(value == channel_deltas[channel] for value in values):
            problems.append(
                f"{channel}: дельта сегмента равна дельте канала "
                f"{channel_deltas[channel]} — {segment_deltas}"
            )
    if not any(value > 0 for value in channel_deltas.values()):
        problems.append(f"нет канала с ростом VOC — {channel_deltas}")
    if not any(value < 0 for value in channel_deltas.values()):
        problems.append(f"нет канала с падением VOC — {channel_deltas}")
    return problems


def check_delta_consistency(extract: Extract) -> list[str]:
    """Показанная дельта обязана совпадать с разностью показанных значений.

    Иначе на экране `4.83` против `4.88` и подпись `−0,04`: интерфейс
    противоречит сам себе так же, как в `V-15`.
    """
    problems = []
    for channel in extract.channels:
        for segment in [None, *SEGMENTS]:
            current = slice_rows(extract, channel, ANCHOR_PERIOD, segment)
            previous = slice_rows(extract, channel, PREVIOUS_PERIOD, segment)
            if not current or not previous:
                continue
            delta = shown(voc(current) - voc(previous))
            from_shown = shown(shown(voc(current)) - shown(voc(previous)))
            if delta != from_shown:
                problems.append(
                    f"{channel}/{segment or 'канал'}: дельта {delta:+}, "
                    f"а по показанным значениям {from_shown:+}"
                )
    return problems


def check_plan_states(extract: Extract) -> list[str]:
    """В сэмпле обязаны быть все три состояния бейджа: в плане, выше, ниже —
    и срез без плана (`D-04`). Иначе два состояния из четырёх непроверяемы.
    """
    states = Counter()
    anchor_state = None
    planned = set()
    for row in extract.plan:
        if not isinstance(row.minimum, (int, float)) or row.period_from is None:
            continue
        rows = [
            rating
            for rating in numeric(extract.ratings)
            if rating.channel == row.channel
            and (row.segment is None or rating.segment == row.segment)
            and rating.appeal_date
            and row.period_from <= rating.appeal_date <= row.period_to
        ]
        if not rows:
            continue
        planned.add((row.channel, row.segment, row.period_from.strftime("%Y-%m")))
        value = shown(voc(rows))
        state = "выше" if value > row.maximum else "ниже" if value < row.minimum else "в плане"
        states[state] += 1
        if (row.channel, row.segment, row.period_from.strftime("%Y-%m")) == (
            ANCHOR_CHANNEL,
            None,
            ANCHOR_PERIOD,
        ):
            anchor_state = state

    problems = []
    for state in ("в плане", "выше", "ниже"):
        if not states[state]:
            problems.append(f"нет среза в состоянии «{state}» — {dict(states)}")
    if anchor_state != "в плане":
        problems.append(
            f"срез карточки {ANCHOR_CHANNEL} {ANCHOR_PERIOD} — «{anchor_state}», "
            "а макет показывает «В плане» (V-13)"
        )
    unplanned = [
        (channel, segment)
        for channel in extract.channels
        for segment in SEGMENTS
        if slice_rows(extract, channel, ANCHOR_PERIOD, segment)
        and (channel, segment, ANCHOR_PERIOD) not in planned
    ]
    if not unplanned:
        problems.append("нет среза с данными и без плана — D-04 непроверяем")
    return problems


def check_corridor_crossing(extract: Extract) -> list[str]:
    """Дневная линия обязана выходить за коридор в обе стороны — иначе смену
    цвета линии на выходе из коридора не проверить."""
    corridor = next(
        (
            row
            for row in extract.plan
            if row.channel == ANCHOR_CHANNEL
            and row.segment is None
            and row.period_from
            and row.period_from.strftime("%Y-%m") == ANCHOR_PERIOD
        ),
        None,
    )
    if corridor is None:
        return [f"нет коридора для {ANCHOR_CHANNEL} {ANCHOR_PERIOD}"]

    by_day = defaultdict(list)
    for rating in slice_rows(extract, ANCHOR_CHANNEL, ANCHOR_PERIOD):
        by_day[rating.appeal_date].append(rating)
    daily = {day: shown(voc(rows)) for day, rows in by_day.items()}
    above = [day for day, value in daily.items() if value > corridor.maximum]
    below = [day for day, value in daily.items() if value < corridor.minimum]

    problems = []
    if not above:
        problems.append(f"ни один день не выше {corridor.maximum}")
    if not below:
        problems.append(f"ни один день не ниже {corridor.minimum}")
    return problems


def check_dip_day(extract: Extract) -> list[str]:
    """Просадка дня обязана объясняться теми разрезами, что в requirements 3.2:
    `21.05 → VOC ↓ → платежи / выписка / лояльность ↓`.

    Проверяется и порядок, и отрыв: третье место, выигранное третьим знаком,
    в интерфейсе неотличимо от шума.
    """
    rows = slice_rows(extract, ANCHOR_CHANNEL, ANCHOR_PERIOD)
    if not rows:
        return [f"нет оценок {ANCHOR_CHANNEL} за {ANCHOR_PERIOD}"]

    day_rows = [r for r in rows if r.appeal_date.isoformat() == DIP_DAY]
    base_rows = [r for r in rows if r.appeal_date.isoformat() != DIP_DAY]
    if not day_rows:
        return [f"нет оценок за {DIP_DAY}"]

    problems = []
    by_day = defaultdict(list)
    for rating in rows:
        by_day[rating.appeal_date.isoformat()].append(rating)
    worst = min(by_day, key=lambda day: voc(by_day[day]))
    if worst != DIP_DAY:
        problems.append(f"минимум периода {worst}, а просадка размечена на {DIP_DAY}")

    # Вклад взвешен объёмом: без веса разрез из десятка оценок обгоняет
    # платежи на случайной низкой оценке, и «объяснение» становится шумом.
    contributions = {}
    for product in {p for rating in rows for p in products_of(extract, rating)}:
        day_count, day_value = product_voc(extract, day_rows, product)
        _, base_value = product_voc(extract, base_rows, product)
        if day_value is not None and base_value is not None:
            contributions[product] = (base_value - day_value) * day_count / len(day_rows)

    ranked = sorted(contributions, key=lambda product: -contributions[product])
    if ranked[: len(DIP_PRODUCTS)] != DIP_PRODUCTS:
        problems.append(
            f"просадку объясняют {ranked[:4]}, а requirements 3.2 — {DIP_PRODUCTS}"
        )
        return problems
    third, fourth = (contributions[ranked[2]], contributions[ranked[3]])
    if third < DIP_MARGIN or third < 2 * fourth:
        problems.append(
            f"третий разрез «{ranked[2]}» ({third:.3f}) не отрывается от "
            f"четвёртого «{ranked[3]}» ({fourth:.3f}) — порядок держится на шуме"
        )
    return problems


def check_antidriver(extract: Extract) -> list[str]:
    """На дефолтном срезе обязан быть антидрайвер периода: продукт, чей VOC
    упал к предыдущему периоду, и проблема, выросшая в объёме.

    Без этого рейтинг «кто главный антидрайвер и как изменился» (P0 №5)
    наполнять нечем.
    """
    current = slice_rows(extract, ANCHOR_CHANNEL, ANCHOR_PERIOD)
    previous = slice_rows(extract, ANCHOR_CHANNEL, PREVIOUS_PERIOD)
    if not current or not previous:
        return ["нет двух периодов для сравнения"]

    problems = []
    drops = {}
    for product in {p for rating in current for p in products_of(extract, rating)}:
        _, now = product_voc(extract, current, product)
        _, before = product_voc(extract, previous, product)
        if now is not None and before is not None and before - now >= MIN_ANTIDRIVER_DROP:
            drops[product] = round(before - now, 3)
    if not drops:
        problems.append(f"ни один продукт не упал на {MIN_ANTIDRIVER_DROP} и больше")

    now_problems = Counter(rating.problem for rating in current if rating.problem)
    before_problems = Counter(rating.problem for rating in previous if rating.problem)
    if not any(now_problems[key] > before_problems[key] for key in now_problems):
        problems.append("ни одна проблема не выросла в объёме")
    return problems


def check_empty_slice(extract: Extract) -> list[str]:
    """Обязан быть срез с данными в одном периоде и без данных в другом —
    иначе состояние «нет данных за период» (`D-34`) непроверяемо."""
    for channel in extract.channels:
        for segment in SEGMENTS:
            here = slice_rows(extract, channel, ANCHOR_PERIOD, segment)
            there = slice_rows(extract, channel, PREVIOUS_PERIOD, segment)
            if bool(here) != bool(there):
                return []
    return ["нет среза, пустого в одном из периодов"]


def check_small_sample(extract: Extract) -> list[str]:
    """На самом малом срезе индикация недостаточной выборки обязана
    срабатывать (`D-25`, §9).

    Смотрим именно минимальный срез, а не «хоть какой-нибудь»: иначе
    проверку удовлетворит случайный неточный срез, а `КИБ` из единиц оценок
    останется без индикации.
    """
    slices = {}
    for channel in extract.channels:
        for period in (ANCHOR_PERIOD, PREVIOUS_PERIOD):
            for segment in SEGMENTS:
                rows = slice_rows(extract, channel, period, segment)
                if rows:
                    slices[(channel, period, segment)] = rows
    if not slices:
        return ["нет срезов канал × период × сегмент"]

    key = min(slices, key=lambda item: len(slices[item]))
    rows = slices[key]
    if len(rows) < 2:
        return []
    mean = voc(rows)
    variance = sum((row.mark - mean) ** 2 for row in rows) / (len(rows) - 1)
    precision = 1.96 * math.sqrt(variance / len(rows))
    if precision <= SAMPLE_PRECISION:
        return [
            f"минимальный срез {key} — {len(rows)} оценок, полуширина ДИ "
            f"{precision:.4f} не превышает {SAMPLE_PRECISION}"
        ]
    return []


def check_dictionaries_differ(extract: Extract) -> list[str]:
    """Справочники каналов обязаны различаться на общем триггере: иначе join
    только по триггеру, без канала, пройдёт незамеченным (§3.2)."""
    channels = sorted(extract.dictionaries)
    if len(channels) < 2:
        return ["меньше двух справочников — различие каналов не проверяется"]
    for left in channels:
        for right in channels:
            if left >= right:
                continue
            shared = set(extract.dictionaries[left]) & set(extract.dictionaries[right])
            if any(
                extract.dictionaries[left][key] != extract.dictionaries[right][key]
                for key in shared
            ):
                return []
    return [f"справочники {channels} совпадают на всех общих триггерах"]


def check_multi_operation(extract: Extract) -> list[str]:
    """Многозначные OPERATION_NAME (§5.2), в том числе сходящиеся в один
    продукт — на них проверяется дедупликация по VOC_CCODE."""
    problems = []
    multi = [rating for rating in extract.ratings if len(rating.operations) > 1]
    share = len(multi) / len(extract.ratings)
    if share < MIN_MULTI_OPERATION_SHARE:
        problems.append(
            f"строк с несколькими триггерами {len(multi)} ({share:.1%}), "
            f"нужно не меньше {MIN_MULTI_OPERATION_SHARE:.0%}"
        )
    if not any(len(products_of(extract, rating)) == 1 for rating in multi):
        problems.append("нет оценок, чьи триггеры сходятся в один продукт")
    return problems


def check_blank_markup(extract: Extract) -> list[str]:
    """Оценки без разметки и с частичной разметкой (§5.3, `D-11`)."""
    problems = []
    blank = [r for r in extract.ratings if not r.problem and not r.domain]
    partial = [r for r in extract.ratings if r.domain and not r.problem]
    share = len(blank) / len(extract.ratings)
    if share < MIN_BLANK_MARKUP_SHARE:
        problems.append(
            f"строк без problem и domain {len(blank)} ({share:.1%}), "
            f"нужно не меньше {MIN_BLANK_MARKUP_SHARE:.0%}"
        )
    if not partial:
        problems.append("нет строк с заполненным domain и пустым problem")
    return problems


def check_label_gaps(extract: Extract) -> list[str]:
    """Обязан быть код без подписи: `D-02` требует показать в этом случае сам
    код, и без такого кода fallback непроверяем."""
    labelled = {(row.dimension, row.code) for row in extract.labels if row.label}
    for dimension, codes in (
        ("сегмент", {rating.segment for rating in extract.ratings}),
        ("тип проблемы", {r.problem_type for r in extract.ratings if r.problem_type}),
        ("канал", set(extract.channels)),
    ):
        if any((dimension, code) not in labelled for code in codes):
            return []
    return ["у всех кодов есть подпись — fallback D-02 непроверяем"]


def check_verbatim(extract: Extract) -> list[str]:
    """Прямая речь обязана содержать длинный и многострочный комментарий —
    на коротких одинаковых фразах перенос и обрезка не проверяются."""
    comments = [r.client_comment for r in extract.ratings if r.client_comment]
    problems = []
    if not comments:
        problems.append("в сэмпле нет ни одного комментария")
        return problems
    if max(len(comment) for comment in comments) < MIN_LONG_COMMENT:
        problems.append(
            f"самый длинный комментарий — {max(len(c) for c in comments)} символов, "
            f"нужен хотя бы {MIN_LONG_COMMENT}"
        )
    if not any("\n" in comment for comment in comments):
        problems.append("нет комментария с переводом строки")
    return problems


EXTRACT_CHECKS = [
    ("channel-sheet", check_channel_sheets),
    ("required-fields", check_required_fields),
    ("ccode-unique", check_ccode_unique),
    ("mark-range", check_mark_range),
    ("distribution", check_distribution),
    ("unmapped-trigger", check_dictionary_join),
    ("plan-rows", check_plan_rows),
    ("labels", check_labels),
]

SAMPLE_CHECKS = [
    ("voc-anchor", check_voc_anchor),
    ("distribution-card", check_distribution_card),
    ("period-coverage", check_period_coverage),
    ("delta-signs", check_delta_signs),
    ("delta-consistency", check_delta_consistency),
    ("plan-states", check_plan_states),
    ("corridor-crossing", check_corridor_crossing),
    ("dip-day", check_dip_day),
    ("antidriver", check_antidriver),
    ("empty-slice", check_empty_slice),
    ("small-sample", check_small_sample),
    ("dictionary-differs", check_dictionaries_differ),
    ("multi-operation", check_multi_operation),
    ("blank-markup", check_blank_markup),
    ("label-gaps", check_label_gaps),
    ("verbatim", check_verbatim),
]

ALL_CHECKS = dict(EXTRACT_CHECKS + SAMPLE_CHECKS)


def run(extract: Extract, checks: list[tuple[str, object]]) -> list[str]:
    """Прогоняет проверки и печатает по строке на каждую.

    Исключение внутри проверки — это её провал, а не конец отчёта: иначе одна
    текстовая ячейка в числовой колонке лишает аналитика остальных диагнозов.
    """
    failed = []
    for code, check in checks:
        try:
            problems = check(extract)
        except Exception as error:  # noqa: BLE001 — диагноз важнее типа ошибки
            problems = [f"проверка не выполнилась: {type(error).__name__}: {error}"]
        if problems:
            failed.append(code)
            print(f"ОШИБКА  {code}")
            for problem in problems[:10]:
                print(f"        {problem}")
            if len(problems) > 10:
                print(f"        … ещё {len(problems) - 10}")
        else:
            print(f"ОК      {code}")
    return failed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument(
        "--sample",
        action="store_true",
        help="дополнительно проверить обещания синтетического сэмпла (data-model §9)",
    )
    arguments = parser.parse_args()

    try:
        extract = load(arguments.source)
    except SchemaError as error:
        print(f"ОШИБКА  schema\n        {error}")
        print("\nвыгрузка не соответствует docs/data-model.md §3", file=sys.stderr)
        return 1
    print(f"ОК      schema")
    print(f"{arguments.source}: {len(extract.ratings)} оценок, каналы {extract.channels}")

    print("\n-- выгрузка --")
    failed = run(extract, EXTRACT_CHECKS)
    if arguments.sample:
        print("\n-- сэмпл (data-model §9) --")
        failed += run(extract, SAMPLE_CHECKS)

    if failed:
        print(
            f"\nнарушено проверок: {len(failed)} — {', '.join(failed)}",
            file=sys.stderr,
        )
        return 1
    print("\nвсе проверки пройдены")
    return 0


if __name__ == "__main__":
    sys.exit(main())
