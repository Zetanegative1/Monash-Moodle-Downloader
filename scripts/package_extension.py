#!/usr/bin/env python3
"""Build a clean, reproducible ZIP for loading the Chrome extension unpacked."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


PACKAGE_FILES = (
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "LICENSE",
)

FIXED_TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def read_version(project_root: Path) -> str:
    manifest = json.loads((project_root / "manifest.json").read_text(encoding="utf-8"))
    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        raise ValueError("manifest.json does not contain a valid version")
    return version


def package_extension(project_root: Path, output_path: Path | None = None) -> Path:
    project_root = project_root.resolve()
    version = read_version(project_root)
    output_path = output_path or (
        project_root / "dist" / f"Monash-Moodle-Downloader-v{version}.zip"
    )
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    missing = [relative for relative in PACKAGE_FILES if not (project_root / relative).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing package file(s): {', '.join(missing)}")

    temporary_path = output_path.with_suffix(".zip.tmp")
    with ZipFile(temporary_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in PACKAGE_FILES:
            source = project_root / relative
            info = ZipInfo(relative, FIXED_TIMESTAMP)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())

    temporary_path.replace(output_path)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output ZIP path. Defaults to dist/ with the manifest version.",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    output = package_extension(project_root, args.output)
    print(output)


if __name__ == "__main__":
    main()
