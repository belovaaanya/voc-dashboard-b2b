"""Проверка pipeline данных с двух сторон.

Зелёная проверка ничего не доказывает, пока не падала на заведомо ломаном
случае, поэтому каждый инвариант `check_data.py` здесь ломают намеренно и
убеждаются, что он срабатывает — и что на корректной выгрузке он молчит.

Запуск: `python3 tools/test_pipeline.py`.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from dataclasses import replace
from datetime import date
from pathlib import Path

import check_data as cd
import voc_schema as vs

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent

CHECKS = {
    "channel-sheet": cd.check_channel_sheets,
    "required-fields": cd.check_required_fields,
    "ccode-unique": cd.check_ccode_unique,
    "mark-range": cd.check_mark_range,
    "voc-anchor": cd.check_voc_anchor,
    "distribution": cd.check_distribution,
    "unmapped-trigger": cd.check_dictionary_join,
    "dictionary-differs": cd.check_dictionaries_differ,
    "multi-operation": cd.check_multi_operation,
    "blank-markup": cd.check_blank_markup,
    "plan-badge": cd.check_plan,
    "period-coverage": cd.check_period_coverage,
    "small-sample": cd.check_small_sample,
    "labels": cd.check_labels,
}


class Run:
    def __init__(self) -> None:
        self.failed = 0

    def expect(self, condition: bool, description: str, detail: str = "") -> None:
        if condition:
            print(f"ОК      {description}")
        else:
            self.failed += 1
            print(f"ПРОВАЛ  {description}")
            if detail:
                print(f"        {detail}")


def copy_of(extract: vs.Extract) -> vs.Extract:
    return vs.Extract(
        ratings=list(extract.ratings),
        dictionaries={channel: dict(mapping) for channel, mapping in extract.dictionaries.items()},
        plan=list(extract.plan),
        labels=list(extract.labels),
        sheet_names=list(extract.sheet_names),
    )


def anchor_rows(extract: vs.Extract) -> list[int]:
    return [
        index
        for index, rating in enumerate(extract.ratings)
        if rating.channel == cd.ANCHOR_CHANNEL and cd.period_of(rating) == cd.ANCHOR_PERIOD
    ]


def break_channel_sheet(extract):
    extract.ratings[0] = replace(extract.ratings[0], channel="ДРУГОЙ")


def break_required_fields(extract):
    extract.ratings[5] = replace(extract.ratings[5], segment="")


def break_ccode_unique(extract):
    extract.ratings[1] = replace(extract.ratings[1], voc_ccode=extract.ratings[0].voc_ccode)


def break_mark_range(extract):
    extract.ratings[3] = replace(extract.ratings[3], mark=0)


def break_voc_anchor_mean(extract):
    """Средняя оценка среза уезжает от ориентира карточки."""
    moved = 0
    for index in anchor_rows(extract):
        if extract.ratings[index].mark == 5 and moved < 300:
            extract.ratings[index] = replace(extract.ratings[index], mark=3)
            moved += 1


def break_voc_anchor_count(extract):
    for index in reversed(anchor_rows(extract)[-5:]):
        del extract.ratings[index]


def break_distribution(extract):
    extract.ratings[7] = replace(extract.ratings[7], mark=6)


def break_unmapped_trigger(extract):
    channel = next(iter(extract.dictionaries))
    del extract.dictionaries[channel][next(iter(extract.dictionaries[channel]))]


def break_dictionaries_differ(extract):
    """Справочники каналов совпадают на общих триггерах — ошибка join только
    по триггеру, без канала, становится невидимой."""
    left, right = sorted(extract.dictionaries)[:2]
    for trigger, value in extract.dictionaries[left].items():
        if trigger in extract.dictionaries[right]:
            extract.dictionaries[right][trigger] = value


def break_multi_operation(extract):
    extract.ratings = [
        replace(rating, operation_name=rating.operations[0]) for rating in extract.ratings
    ]


def break_blank_markup(extract):
    extract.ratings = [
        replace(rating, domain="Платежи", problem_type="Ошибка", problem="Платёж висит в обработке")
        for rating in extract.ratings
    ]


def break_plan_badge(extract):
    """Коридор перестаёт содержать фактический VOC — бейдж «В плане» врёт (V-13)."""
    for index, row in enumerate(extract.plan):
        if row.channel == cd.ANCHOR_CHANNEL and row.segment is None and row.period_from.month == 5:
            extract.plan[index] = replace(row, minimum=4.60, maximum=4.70)


def break_period_coverage(extract):
    hole = date(2026, 5, 15)
    extract.ratings = [rating for rating in extract.ratings if rating.appeal_date != hole]


def break_small_sample(extract):
    extract.ratings = [
        replace(rating, mark=5) if rating.segment == "КИБ" else rating for rating in extract.ratings
    ]


def break_labels(extract):
    extract.labels.append(replace(extract.labels[0], row=99))


CASES = [
    ("channel-sheet", break_channel_sheet),
    ("required-fields", break_required_fields),
    ("ccode-unique", break_ccode_unique),
    ("mark-range", break_mark_range),
    ("voc-anchor", break_voc_anchor_mean),
    ("voc-anchor", break_voc_anchor_count),
    ("distribution", break_distribution),
    ("unmapped-trigger", break_unmapped_trigger),
    ("dictionary-differs", break_dictionaries_differ),
    ("multi-operation", break_multi_operation),
    ("blank-markup", break_blank_markup),
    ("plan-badge", break_plan_badge),
    ("period-coverage", break_period_coverage),
    ("small-sample", break_small_sample),
    ("labels", break_labels),
]


def run_tool(name: str, *arguments: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(TOOLS / name), *arguments],
        capture_output=True,
        text=True,
    )


def json_file(directory: Path, role: str) -> dict | list:
    manifest = json.loads((directory / "manifest.json").read_text())
    name = next(file["name"] for file in manifest["files"] if file["role"] == role)
    return json.loads((directory / name).read_text())


def main() -> int:
    run = Run()
    workspace = Path(tempfile.mkdtemp(prefix="voc-pipeline-"))
    sample = workspace / "voc-dashboard.xlsx"
    twin = workspace / "twin.xlsx"

    print("== генератор ==")
    first = run_tool("make_sample_data.py", "--out", str(sample))
    second = run_tool("make_sample_data.py", "--out", str(twin))
    run.expect(first.returncode == 0, "генератор проходит", first.stderr)
    run.expect(
        sample.read_bytes() == twin.read_bytes(),
        "два прогона дают байт-в-байт одинаковый файл",
    )

    print("\n== проверка на корректной выгрузке ==")
    good = run_tool("check_data.py", "--source", str(sample))
    run.expect(good.returncode == 0, "check_data проходит на корректной выгрузке", good.stdout)

    base = vs.load(sample)
    for code, check in CHECKS.items():
        run.expect(not check(base), f"{code} молчит на корректной выгрузке", str(check(base))[:200])

    print("\n== каждый инвариант ломается намеренно ==")
    for code, mutation in CASES:
        broken = copy_of(base)
        mutation(broken)
        problems = CHECKS[code](broken)
        run.expect(bool(problems), f"{code} падает после «{mutation.__name__}»")

    print("\n== схема выгрузки ==")
    from openpyxl import load_workbook

    renamed = workspace / "renamed-column.xlsx"
    workbook = load_workbook(sample)
    workbook["АБМ"].cell(row=1, column=7).value = "MARK"
    workbook.save(renamed)
    schema = run_tool("check_data.py", "--source", str(renamed))
    run.expect(
        schema.returncode != 0 and "ОШИБКА  schema" in schema.stdout,
        "переименованная колонка ловится как schema",
        schema.stdout[-300:],
    )

    print("\n== конвертер ==")
    out = workspace / "site-data"
    convert = run_tool("xlsx_to_json.py", "--source", str(sample), "--out", str(out))
    run.expect(convert.returncode == 0, "конвертер проходит", convert.stderr)

    manifest = json.loads((out / "manifest.json").read_text())
    ratings = json_file(out, "ratings")
    verbatim = json_file(out, "verbatim")
    reference = json_file(out, "reference")

    run.expect(
        all("answer_date" not in row for row in ratings),
        "ANSWER_DATE в JSON не попадает (D-06)",
    )
    run.expect(
        any(len(row["operations"]) > 1 for row in ratings),
        "OPERATION_NAME развёрнут в массив конвертером (§7)",
    )
    run.expect(
        any(row["problem"] is None and row["domain"] is None for row in ratings),
        "оценки без разметки сохранены как null (D-11)",
    )
    run.expect(
        verbatim["not_for_display"] == ["oslk_expertise_name"],
        "OSLK_EXPERTISE_NAME перенесён и помечен как не для показа (D-05)",
    )
    run.expect(
        all(
            file["name"].startswith(file["role"] + ".") and len(file["name"].split(".")) == 3
            for file in manifest["files"]
        ),
        "имена файлов содержат хэш содержимого (D-36)",
        str([file["name"] for file in manifest["files"]]),
    )
    run.expect(
        manifest["period"] == {"from": "2026-04-01", "to": "2026-05-31"}
        and manifest["generated_at"].endswith("+00:00"),
        "manifest несёт период выгрузки и время сборки (D-35)",
        str(manifest["period"]),
    )
    run.expect(
        len(ratings) == manifest["files"][0]["rows"] == len(vs.load(sample).ratings),
        "число строк в манифесте совпадает с выгрузкой",
    )
    run.expect(
        reference["operations"]["АБМ"]["Отправка платежа"]
        != reference["operations"]["НИБ"]["Отправка платежа"],
        "справочник переносится с разбивкой по каналам (§3.2)",
    )

    stale = out / "ratings.000000000000.json"
    stale.write_text("[]")
    run_tool("xlsx_to_json.py", "--source", str(sample), "--out", str(out))
    run.expect(not stale.exists(), "прежние версии файлов удаляются")

    print("\n== несопоставленный триггер (D-12) ==")
    trimmed = workspace / "trimmed-dictionary.xlsx"
    workbook = load_workbook(sample)
    sheet = workbook["Справочник АБМ"]
    dropped = sheet.cell(row=2, column=1).value
    sheet.delete_rows(2)
    workbook.save(trimmed)

    strict = run_tool("xlsx_to_json.py", "--source", str(trimmed), "--out", str(out))
    run.expect(
        strict.returncode != 0 and dropped in strict.stderr,
        "конвертер падает и печатает несопоставленные значения",
        strict.stderr[-300:],
    )
    relaxed = run_tool(
        "xlsx_to_json.py", "--source", str(trimmed), "--out", str(out), "--allow-unmapped"
    )
    run.expect(relaxed.returncode == 0, "--allow-unmapped не роняет сборку", relaxed.stderr)
    reference = json_file(out, "reference")
    manifest = json.loads((out / "manifest.json").read_text())
    run.expect(
        reference["operations"]["АБМ"][dropped]["product"] == "Без сопоставления"
        and any(item["operation"] == dropped for item in manifest["unmapped_operations"]),
        "несопоставленный триггер попадает в группу «Без сопоставления»",
    )
    checked = run_tool("check_data.py", "--source", str(trimmed))
    run.expect(
        "ОШИБКА  unmapped-trigger" in checked.stdout,
        "check_data тоже ловит отставший справочник",
        checked.stdout[-300:],
    )

    print("\n== порог объёма (D-37) ==")
    over = run_tool(
        "xlsx_to_json.py", "--source", str(sample), "--out", str(out), "--max-gzip-mb", "0.01"
    )
    run.expect(
        "ВНИМАНИЕ" in over.stderr and "предагрегировать" in over.stderr,
        "превышение порога gzip даёт предупреждение",
        over.stderr[-200:],
    )
    under = run_tool("xlsx_to_json.py", "--source", str(sample), "--out", str(out))
    run.expect("ВНИМАНИЕ" not in under.stderr, "в пределах порога предупреждения нет")

    print()
    if run.failed:
        print(f"провалено проверок: {run.failed}", file=sys.stderr)
        return 1
    print(f"все проверки пройдены, рабочая копия: {workspace}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
