"""Проверка непротиворечивости выгрузки. Падает при нарушении инварианта.

Скрипт держит ориентиры макета своими константами, а не читает их из
генератора: расхождение генератора с тем, что показывает карточка, обязано
всплывать здесь, а не в браузере (docs/data-model.md §9).

Каждая проверка печатает свой код — по нему на неё ссылаются тесты и PR.
"""

from __future__ import annotations

import argparse
import math
import sys
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

from voc_schema import MARKS, SEGMENTS, Extract, SchemaError, load

DEFAULT_SOURCE = Path("data/voc-dashboard.xlsx")

# Ориентиры макета: VOC канала АБМ за текущий период и число оценок под ним.
# Распределение оценок из макета (5 / 7 / 10 / 25 / 53 %) не воспроизводится —
# оно даёт среднее 4.14 и противоречит этой же карточке, см. V-22.
ANCHOR_CHANNEL = "АБМ"
ANCHOR_PERIOD = "2026-05"
ANCHOR_VOC = 4.90
ANCHOR_COUNT = 10459

PREVIOUS_PERIOD = "2026-04"

# Порог достаточности выборки: полуширина 95 % доверительного интервала
# среднего (D-25, значение — заглушка до подписи аналитики).
SAMPLE_PRECISION = 0.1

MIN_MULTI_OPERATION_SHARE = 0.05
MIN_BLANK_MARKUP_SHARE = 0.05


class Report:
    def __init__(self) -> None:
        self.failed: list[str] = []

    def check(self, code: str, problems: list[str]) -> None:
        if problems:
            self.failed.append(code)
            print(f"ОШИБКА  {code}")
            for problem in problems[:10]:
                print(f"        {problem}")
            if len(problems) > 10:
                print(f"        … ещё {len(problems) - 10}")
        else:
            print(f"ОК      {code}")


def period_of(rating) -> str:
    return rating.appeal_date.strftime("%Y-%m") if rating.appeal_date else "?"


def voc(rows) -> float:
    return sum(row.mark for row in rows) / len(rows)


def check_channel_sheets(extract: Extract) -> list[str]:
    """Листы оценок различаются только каналом (§3.1), а имя листа — это канал:
    иначе справочник канала подцепится не к тем строкам."""
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
        if rating.answer_date is None:
            problems.append(f"{where}: пустой ANSWER_DATE")
        elif rating.appeal_date and rating.answer_date < rating.appeal_date:
            problems.append(f"{where}: ANSWER_DATE раньше APPEAL_DATE")
    return problems


def check_ccode_unique(extract: Extract) -> list[str]:
    """VOC_CCODE — ключ дедупликации в неаддитивных разрезах (§5.2)."""
    counts = Counter(rating.voc_ccode for rating in extract.ratings)
    return [f"VOC_CCODE «{code}» встречается {count} раз" for code, count in counts.items() if count > 1]


def check_mark_range(extract: Extract) -> list[str]:
    problems = []
    for rating in extract.ratings:
        if not isinstance(rating.mark, int) or isinstance(rating.mark, bool) or rating.mark not in MARKS:
            problems.append(f"{rating.sheet}:{rating.row}: MARK1_VALUE = {rating.mark!r}")
    return problems


def check_voc_anchor(extract: Extract) -> list[str]:
    rows = [
        rating
        for rating in extract.ratings
        if rating.channel == ANCHOR_CHANNEL and period_of(rating) == ANCHOR_PERIOD
    ]
    if not rows:
        return [f"нет оценок {ANCHOR_CHANNEL} за {ANCHOR_PERIOD}"]

    problems = []
    if len(rows) != ANCHOR_COUNT:
        problems.append(f"оценок {len(rows)}, ориентир карточки {ANCHOR_COUNT}")
    actual = round(voc(rows), 2)
    if actual != ANCHOR_VOC:
        problems.append(f"VOC {actual}, ориентир карточки {ANCHOR_VOC}")

    # Сегменты обязаны сходиться с каналом: средние не усредняются, при грани
    # «одна оценка» это выполняется только если сегменты покрывают срез (V-14).
    by_segment = sum(1 for rating in rows if rating.segment in SEGMENTS)
    if by_segment != len(rows):
        problems.append(f"по сегментам разложено {by_segment} оценок из {len(rows)}")
    return problems


def check_distribution(extract: Extract) -> list[str]:
    """Доли распределения оценок 1–5 обязаны давать ровно 100 %.

    Считается точной арифметикой: доля уходит от 100 %, только если оценка
    вышла за 1…5 или потерялась, а именно это и надо поймать.
    """
    problems = []
    slices = defaultdict(list)
    for rating in extract.ratings:
        slices[(rating.channel, period_of(rating))].append(rating)
    for (channel, period), rows in sorted(slices.items()):
        counts = Counter(row.mark for row in rows)
        total = Fraction(0)
        for mark in MARKS:
            total += Fraction(counts[mark], len(rows))
        if total != 1:
            problems.append(
                f"{channel} {period}: доли 1–5 дают {float(total) * 100:.2f} % "
                f"({sum(counts[mark] for mark in MARKS)} оценок из {len(rows)})"
            )
    return problems


def check_dictionary_join(extract: Extract) -> list[str]:
    """Триггер без пары в справочнике своего канала (D-12)."""
    unmapped = set()
    for rating in extract.ratings:
        mapping = extract.dictionaries.get(rating.channel, {})
        for trigger in rating.operations:
            if trigger not in mapping:
                unmapped.add((rating.channel, trigger))
    return [f"{channel}: триггер «{trigger}» отсутствует в справочнике" for channel, trigger in sorted(unmapped)]


def check_dictionaries_differ(extract: Extract) -> list[str]:
    """Справочники каналов обязаны различаться на общем триггере.

    Ключ join — пара (канал, триггер) (§3.2). Если на общих триггерах
    справочники совпадают, join только по триггеру пройдёт незамеченным.
    """
    channels = sorted(extract.dictionaries)
    if len(channels) < 2:
        return ["меньше двух справочников — различие каналов не проверяется"]
    for left in channels:
        for right in channels:
            if left >= right:
                continue
            shared = set(extract.dictionaries[left]) & set(extract.dictionaries[right])
            if any(extract.dictionaries[left][t] != extract.dictionaries[right][t] for t in shared):
                return []
    return [f"справочники {channels} совпадают на всех общих триггерах"]


def check_multi_operation(extract: Extract) -> list[str]:
    """В сэмпле обязаны быть многозначные OPERATION_NAME (§5.2), в том числе
    сходящиеся в один продукт — на них проверяется дедупликация."""
    problems = []
    multi = [rating for rating in extract.ratings if len(rating.operations) > 1]
    share = len(multi) / len(extract.ratings)
    if share < MIN_MULTI_OPERATION_SHARE:
        problems.append(
            f"строк с несколькими триггерами {len(multi)} ({share:.1%}), "
            f"нужно не меньше {MIN_MULTI_OPERATION_SHARE:.0%}"
        )
    collapsing = 0
    for rating in multi:
        mapping = extract.dictionaries.get(rating.channel, {})
        products = {mapping[t][1] for t in rating.operations if t in mapping}
        if len(products) == 1:
            collapsing += 1
    if not collapsing:
        problems.append("нет оценок, чьи триггеры сходятся в один продукт")
    return problems


def check_blank_markup(extract: Extract) -> list[str]:
    """В сэмпле обязаны быть оценки без разметки и с частичной разметкой (§5.3, D-11)."""
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


def check_plan(extract: Extract) -> list[str]:
    """Плановый коридор обязан делать бейдж правдивым (V-13).

    Незаполненный план — не ошибка (D-04), поэтому проверяются только те
    строки плана, под которые есть данные.
    """
    problems = []
    for row in extract.plan:
        if row.period_from is None or row.period_to is None:
            problems.append(f"plan:{row.row}: пустой период")
            continue
        if not isinstance(row.minimum, (int, float)) or not isinstance(row.maximum, (int, float)):
            problems.append(f"plan:{row.row}: min/max не число ({row.minimum!r}, {row.maximum!r})")
            continue
        if row.minimum > row.maximum:
            problems.append(f"plan:{row.row}: min {row.minimum} больше max {row.maximum}")
            continue
        rows = [
            rating
            for rating in extract.ratings
            if rating.channel == row.channel
            and (row.segment is None or rating.segment == row.segment)
            and rating.appeal_date
            and row.period_from <= rating.appeal_date <= row.period_to
        ]
        if not rows:
            continue
        actual = round(voc(rows), 2)
        if not row.minimum <= actual <= row.maximum:
            problems.append(
                f"plan:{row.row}: {row.channel}/{row.segment or 'канал'} "
                f"{row.period_from:%Y-%m}: VOC {actual} вне коридора {row.minimum}–{row.maximum}"
            )
    return problems


def check_period_coverage(extract: Extract) -> list[str]:
    """Диапазон дат обязан покрывать текущий период и предыдущий аналогичный,
    иначе сравнение периодов (P0 №3) не проверить."""
    problems = []
    by_channel = defaultdict(set)
    days = defaultdict(set)
    for rating in extract.ratings:
        by_channel[rating.channel].add(period_of(rating))
        days[(rating.channel, period_of(rating))].add(rating.appeal_date)
    for channel, periods in sorted(by_channel.items()):
        for period in (ANCHOR_PERIOD, PREVIOUS_PERIOD):
            if period not in periods:
                problems.append(f"{channel}: нет оценок за {period}")
    for (channel, period), covered in sorted(days.items()):
        if period not in (ANCHOR_PERIOD, PREVIOUS_PERIOD):
            continue
        year, month = (int(part) for part in period.split("-"))
        length = (31 if month in (1, 3, 5, 7, 8, 10, 12) else 30 if month != 2 else 28)
        if len(covered) != length:
            problems.append(f"{channel} {period}: заполнено {len(covered)} дней из {length}")
    return problems


def check_small_sample(extract: Extract) -> list[str]:
    """Хотя бы один срез обязан быть слишком малым для надёжного вывода —
    иначе индикацию недостаточной выборки не проверить (§9, D-25)."""
    for period in (ANCHOR_PERIOD, PREVIOUS_PERIOD):
        for channel in extract.channels:
            for segment in SEGMENTS:
                rows = [
                    r
                    for r in extract.ratings
                    if r.channel == channel and r.segment == segment and period_of(r) == period
                ]
                if len(rows) < 2:
                    continue
                mean = voc(rows)
                variance = sum((r.mark - mean) ** 2 for r in rows) / (len(rows) - 1)
                if 1.96 * math.sqrt(variance / len(rows)) > SAMPLE_PRECISION:
                    return []
    return [f"нет среза с полушириной 95 % ДИ больше {SAMPLE_PRECISION}"]


def check_labels(extract: Extract) -> list[str]:
    seen = set()
    problems = []
    for row in extract.labels:
        if not row.dimension or not row.code:
            problems.append(f"labels:{row.row}: пустое измерение или код")
        elif (row.dimension, row.code) in seen:
            problems.append(f"labels:{row.row}: подпись для ({row.dimension}, {row.code}) уже задана")
        seen.add((row.dimension, row.code))
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    arguments = parser.parse_args()

    report = Report()
    try:
        extract = load(arguments.source)
    except SchemaError as error:
        report.check("schema", [str(error)])
        print("\nвыгрузка не соответствует docs/data-model.md §3", file=sys.stderr)
        return 1
    report.check("schema", [])

    print(f"{arguments.source}: {len(extract.ratings)} оценок, каналы {extract.channels}")
    report.check("channel-sheet", check_channel_sheets(extract))
    report.check("required-fields", check_required_fields(extract))
    report.check("ccode-unique", check_ccode_unique(extract))
    report.check("mark-range", check_mark_range(extract))
    report.check("voc-anchor", check_voc_anchor(extract))
    report.check("distribution", check_distribution(extract))
    report.check("unmapped-trigger", check_dictionary_join(extract))
    report.check("dictionary-differs", check_dictionaries_differ(extract))
    report.check("multi-operation", check_multi_operation(extract))
    report.check("blank-markup", check_blank_markup(extract))
    report.check("plan-badge", check_plan(extract))
    report.check("period-coverage", check_period_coverage(extract))
    report.check("small-sample", check_small_sample(extract))
    report.check("labels", check_labels(extract))

    if report.failed:
        print(f"\nнарушено проверок: {len(report.failed)} — {', '.join(report.failed)}", file=sys.stderr)
        return 1
    print("\nвсе проверки пройдены")
    return 0


if __name__ == "__main__":
    sys.exit(main())
