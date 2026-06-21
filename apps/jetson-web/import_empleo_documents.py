#!/usr/bin/env python3
import argparse
from pathlib import Path

import main


def run(source: Path) -> None:
    main.init_db()
    imported = 0
    duplicates = 0
    failed = 0
    for path in sorted(source.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in main.ALLOWED_DOCUMENT_EXTENSIONS:
            continue
        relative_name = str(path.relative_to(source))
        try:
            result = main.import_document_path(path, relative_name)
            if result["duplicate"]:
                duplicates += 1
                print(f"DUPLICATE {relative_name}")
            else:
                imported += 1
                print(f"IMPORTED {relative_name}")
        except Exception as exc:
            failed += 1
            print(f"FAILED {relative_name}: {exc}")
    print(f"SUMMARY imported={imported} duplicates={duplicates} failed={failed}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importa documentos privados de Empleo")
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    if not args.source.is_dir():
        parser.error("source debe ser una carpeta")
    run(args.source.resolve())
