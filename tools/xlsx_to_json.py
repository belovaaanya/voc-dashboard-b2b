"""Конвертер data/*.xlsx → site/data/*.json (docs/data-model.md §7).

Разбор xlsx вынесен в deploy: parser для `.xlsx` весит больше, чем все данные
дашборда, а сами данные меняются редко и одинаковы для всех.

Что делает конвертер, а не браузер:
- разворачивает многозначный `OPERATION_NAME` в массив `operations` (§5.2);
- проверяет join (канал, триггер) по справочнику и падает на несопоставленных
  значениях (`D-12`), если не передан `--allow-unmapped`;
- выбрасывает `ANSWER_DATE` (`D-06`);
- разносит факты и тексты по разным файлам, чтобы страница не тянула
  комментарии при открытии (§7).
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from voc_schema import Extract, SchemaError, load

DEFAULT_SOURCE = Path("data/voc-dashboard.xlsx")
DEFAULT_OUTPUT = Path("site/data")

# Порог объёма (D-37): за ним следующий шаг — не «оптимизировать JSON», а
# предагрегация в источнике.
DEFAULT_MAX_GZIP_MB = 5.0

UNMAPPED_LABEL = "Без сопоставления"

# OSLK_EXPERTISE_NAME переносим, но природа поля неизвестна: показать его как
# цитату клиента — риск вывести внутренний экспертный текст от лица клиента
# (D-05). Флаг едет вместе с данными, чтобы UI не пришлось помнить это правило.
NOT_FOR_DISPLAY = ["oslk_expertise_name"]


def build_ratings(extract: Extract) -> list[dict]:
    return [
        {
            "voc_ccode": rating.voc_ccode,
            "appeal_date": rating.appeal_date.isoformat() if rating.appeal_date else None,
            "channel": rating.channel,
            "segment": rating.segment,
            "mark": rating.mark,
            "domain": rating.domain,
            "problem_type": rating.problem_type,
            "problem": rating.problem,
            "operations": rating.operations,
        }
        for rating in extract.ratings
    ]


def build_verbatim(extract: Extract) -> dict:
    items = {}
    for rating in extract.ratings:
        if rating.client_comment or rating.oslk_expertise_name:
            items[rating.voc_ccode] = {
                "client_comment": rating.client_comment,
                "oslk_expertise_name": rating.oslk_expertise_name,
            }
    return {"not_for_display": NOT_FOR_DISPLAY, "items": items}


def build_reference(extract: Extract, unmapped: set[tuple[str, str]]) -> dict:
    operations = {
        channel: {
            trigger: {"kp": kp, "product": product}
            for trigger, (kp, product) in sorted(mapping.items())
        }
        for channel, mapping in sorted(extract.dictionaries.items())
    }
    for channel, trigger in sorted(unmapped):
        operations.setdefault(channel, {})[trigger] = {
            "kp": UNMAPPED_LABEL,
            "product": UNMAPPED_LABEL,
        }

    labels: dict[str, dict[str, str]] = {}
    for row in extract.labels:
        if row.label:
            labels.setdefault(row.dimension, {})[row.code] = row.label

    plan = [
        {
            "channel": row.channel,
            "segment": row.segment,
            "period_from": row.period_from.isoformat() if row.period_from else None,
            "period_to": row.period_to.isoformat() if row.period_to else None,
            "min": row.minimum,
            "max": row.maximum,
        }
        for row in extract.plan
    ]
    return {"channels": extract.channels, "operations": operations, "plan": plan, "labels": labels}


def find_unmapped(extract: Extract) -> set[tuple[str, str]]:
    unmapped = set()
    for rating in extract.ratings:
        mapping = extract.dictionaries.get(rating.channel, {})
        for trigger in rating.operations:
            if trigger not in mapping:
                unmapped.add((rating.channel, trigger))
    return unmapped


def dump(payload: object) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def write_hashed(directory: Path, role: str, payload: object) -> dict:
    """Имя файла содержит хэш содержимого (D-36): без этого после обновления
    выгрузки браузер отдаст закэшированные старые данные."""
    body = dump(payload)
    digest = hashlib.sha256(body).hexdigest()[:12]
    name = f"{role}.{digest}.json"
    (directory / name).write_bytes(body)
    return {
        "role": role,
        "name": name,
        "bytes": len(body),
        "gzip_bytes": len(gzip.compress(body, mtime=0)),
    }


def clean_stale(directory: Path, keep: set[str]) -> list[str]:
    removed = []
    for path in sorted(directory.glob("*.json")):
        if path.name not in keep:
            path.unlink()
            removed.append(path.name)
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--allow-unmapped",
        action="store_true",
        help=f"несопоставленные триггеры не роняют сборку, а попадают в группу «{UNMAPPED_LABEL}» (D-12)",
    )
    parser.add_argument("--max-gzip-mb", type=float, default=DEFAULT_MAX_GZIP_MB)
    arguments = parser.parse_args()

    try:
        extract = load(arguments.source)
    except SchemaError as error:
        print(f"выгрузка не соответствует docs/data-model.md §3: {error}", file=sys.stderr)
        return 1

    unmapped = find_unmapped(extract)
    if unmapped:
        listing = "\n".join(f"  {channel}: «{trigger}»" for channel, trigger in sorted(unmapped))
        if not arguments.allow_unmapped:
            print(
                f"триггеры без пары в справочнике своего канала ({len(unmapped)}):\n{listing}\n"
                "справочник отстал от выгрузки. Тихо выбросить эти строки нельзя — "
                "VOC в разрезе разойдётся с карточкой (D-12).\n"
                f"Перевести их в группу «{UNMAPPED_LABEL}»: --allow-unmapped",
                file=sys.stderr,
            )
            return 1
        print(f"несопоставленных триггеров: {len(unmapped)} → группа «{UNMAPPED_LABEL}»\n{listing}")

    arguments.out.mkdir(parents=True, exist_ok=True)
    ratings = build_ratings(extract)
    verbatim = build_verbatim(extract)
    reference = build_reference(extract, unmapped if arguments.allow_unmapped else set())

    files = [
        write_hashed(arguments.out, "ratings", ratings),
        write_hashed(arguments.out, "verbatim", verbatim),
        write_hashed(arguments.out, "reference", reference),
    ]
    files[0]["rows"] = len(ratings)
    files[1]["rows"] = len(verbatim["items"])
    files[2]["rows"] = sum(len(mapping) for mapping in reference["operations"].values())

    dates = sorted(rating.appeal_date for rating in extract.ratings if rating.appeal_date)
    manifest = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": arguments.source.name,
        "period": {"from": dates[0].isoformat(), "to": dates[-1].isoformat()},
        "channels": extract.channels,
        "unmapped_operations": [
            {"channel": channel, "operation": trigger} for channel, trigger in sorted(unmapped)
        ],
        "files": files,
    }
    # manifest.json без хэша в имени: по нему страница узнаёт имена остальных
    # файлов и дату актуальности данных (D-35, D-36).
    (arguments.out / "manifest.json").write_bytes(dump(manifest))

    stale = clean_stale(arguments.out, {file["name"] for file in files} | {"manifest.json"})
    if stale:
        print(f"удалены прежние версии: {', '.join(stale)}")

    print(f"{arguments.out}/")
    for file in files:
        print(
            f"  {file['name']}: {file['rows']} строк, "
            f"{file['bytes'] / 1024:.0f} КБ, gzip {file['gzip_bytes'] / 1024:.0f} КБ"
        )
    total_gzip = sum(file["gzip_bytes"] for file in files)
    limit = arguments.max_gzip_mb * 1024 * 1024
    print(f"  итого gzip: {total_gzip / 1024 / 1024:.2f} МБ из {arguments.max_gzip_mb} МБ")
    if total_gzip > limit:
        print(
            f"ВНИМАНИЕ: {total_gzip / 1024 / 1024:.2f} МБ gzip превышает порог "
            f"{arguments.max_gzip_mb} МБ. Следующий шаг — не оптимизировать JSON, "
            "а предагрегировать в источнике (D-37).",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
