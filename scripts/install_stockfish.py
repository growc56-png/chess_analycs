#!/usr/bin/env python3
"""Install the official, checksum-verified Stockfish 19 binary for this OS.

Run from the repository root:
    python scripts/install_stockfish.py

The installer downloads the official immutable sf_19 release asset, verifies
its SHA-256 digest, and writes the engine to the path used by backend/config.py.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import stat
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE_API = "https://api.github.com/repos/official-stockfish/Stockfish/releases/tags/sf_19"
USER_AGENT = "ChessTrainer-StockfishInstaller/1.0"

ASSETS = {
    ("Windows", "AMD64"): ("stockfish-windows-x86-64-universal.zip", "stockfish-windows-x86-64-universal.exe"),
    ("Windows", "x86_64"): ("stockfish-windows-x86-64-universal.zip", "stockfish-windows-x86-64-universal.exe"),
    ("Windows", "ARM64"): ("stockfish-windows-arm64-universal.zip", "stockfish-windows-arm64-universal.exe"),
    ("Windows", "aarch64"): ("stockfish-windows-arm64-universal.zip", "stockfish-windows-arm64-universal.exe"),
    ("Linux", "x86_64"): ("stockfish-linux-x86-64-universal.tar.gz", "stockfish"),
    ("Linux", "AMD64"): ("stockfish-linux-x86-64-universal.tar.gz", "stockfish"),
    ("Linux", "aarch64"): ("stockfish-linux-arm64-universal.tar.gz", "stockfish"),
    ("Linux", "ARM64"): ("stockfish-linux-arm64-universal.tar.gz", "stockfish"),
    ("Darwin", "x86_64"): ("stockfish-macos-universal.tar.gz", "stockfish"),
    ("Darwin", "arm64"): ("stockfish-macos-universal.tar.gz", "stockfish"),
}


def request_bytes(url: str, max_bytes: int = 100_000_000) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise RuntimeError("Скачиваемый файл превышает допустимый размер.")
    return data


def download_asset(url: str, destination: Path, expected_size: int, expected_sha256: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    digest = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > expected_size:
                raise RuntimeError("Размер архива больше заявленного GitHub.")
            digest.update(chunk)
            output.write(chunk)

    if total != expected_size:
        raise RuntimeError(f"Неполный архив: получено {total} байт, ожидалось {expected_size}.")
    actual = digest.hexdigest()
    if actual.lower() != expected_sha256.lower():
        raise RuntimeError("SHA-256 архива не совпал. Файл не будет установлен.")


def safe_binary_name(name: str) -> bool:
    base = Path(name).name.lower()
    return base.startswith("stockfish") and (base.endswith(".exe") or "." not in base)


def install_from_zip(archive: Path, target: Path) -> None:
    with zipfile.ZipFile(archive) as bundle:
        matches = [
            item for item in bundle.infolist()
            if not item.is_dir() and safe_binary_name(item.filename) and item.file_size > 1_000_000
        ]
        if not matches:
            raise RuntimeError("В официальном ZIP не найден исполняемый файл Stockfish.")
        selected = sorted(matches, key=lambda item: (0 if "universal" in item.filename.lower() else 1, len(item.filename)))[0]
        with bundle.open(selected) as source, target.open("wb") as output:
            shutil.copyfileobj(source, output)


def install_from_tar(archive: Path, target: Path) -> None:
    with tarfile.open(archive, "r:gz") as bundle:
        matches = [
            item for item in bundle.getmembers()
            if item.isfile() and safe_binary_name(item.name) and item.size > 1_000_000
        ]
        if not matches:
            raise RuntimeError("В официальном TAR.GZ не найден исполняемый файл Stockfish.")
        selected = sorted(matches, key=lambda item: (0 if "universal" in item.name.lower() else 1, len(item.name)))[0]
        source = bundle.extractfile(selected)
        if source is None:
            raise RuntimeError("Не удалось прочитать исполняемый файл из архива.")
        with source, target.open("wb") as output:
            shutil.copyfileobj(source, output)


def main() -> None:
    system = platform.system()
    machine = platform.machine()
    spec = ASSETS.get((system, machine))
    if not spec:
        raise SystemExit(
            f"Автоматическая установка не поддерживает {system}/{machine}. "
            "Скачай универсальную сборку с https://stockfishchess.org/download "
            "и укажи её путь через STOCKFISH_PATH."
        )

    asset_name, output_name = spec
    request = urllib.request.Request(RELEASE_API, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        release = json.load(response)

    asset = next((item for item in release.get("assets", []) if item.get("name") == asset_name), None)
    if not asset:
        raise RuntimeError(f"В релизе {release.get('tag_name')} отсутствует {asset_name}.")
    digest = str(asset.get("digest") or "")
    if not digest.startswith("sha256:"):
        raise RuntimeError("GitHub не предоставил SHA-256 для архива; установка отменена.")

    destination = ROOT / output_name
    with tempfile.TemporaryDirectory(prefix="stockfish-install-") as temp_dir:
        archive = Path(temp_dir) / asset_name
        unpacked = Path(temp_dir) / output_name
        print(f"Скачиваю официальный Stockfish {release.get('tag_name')}…")
        download_asset(
            asset["browser_download_url"],
            archive,
            int(asset["size"]),
            digest.split(":", 1)[1],
        )
        if asset_name.endswith(".zip"):
            install_from_zip(archive, unpacked)
        else:
            install_from_tar(archive, unpacked)

        if system != "Windows":
            unpacked.chmod(unpacked.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        shutil.copy2(unpacked, destination)

    print(f"Stockfish установлен: {destination}")
    print("Убедись, что backend/.env содержит STOCKFISH_PATH с этим путём или оставь автоматическое определение.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(f"Ошибка установки Stockfish: {error}")
