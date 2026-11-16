"""E-06/E-07: dist/ を Netlify 手動デプロイ用 ZIP (スラッシュ区切り統一・バックスラッシュ0件検証) に梱包する。"""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
OUT_ZIP = ROOT / "urito-netlify-deploy.zip"

if not DIST_DIR.exists():
    raise SystemExit("dist/ が見つかりません。先に npm run build を実行してください。")

with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for path in sorted(DIST_DIR.rglob("*")):
        if path.is_file():
            rel = path.relative_to(DIST_DIR).as_posix()
            zf.write(path, rel)

with zipfile.ZipFile(OUT_ZIP, "r") as zf:
    names = zf.namelist()
    bad = [n for n in names if "\\" in n]
    if bad:
        raise SystemExit(f"バックスラッシュを含むZIPエントリを検出しました: {bad}")
    print(f"Created {OUT_ZIP.name}: {len(names)} entries, 0 backslashes, {OUT_ZIP.stat().st_size} bytes")
