"""Phenom Particle Inspector 대면적 자동 분석 CSV 폴더 → public/shared-data/large-area.json

사용: python scripts/build-large-area.py "<CSV 폴더>"

- 파일 이름 앞부분(D_, B-28_, E-2_, F-1_, E-43_ …)으로 지점을 정한다. 지점에 해당하지 않는 파일(Free Filter, Bio Filter 등)은
  비교용 참조 그룹(siteId = null)으로 넣는다.
- 열 이름에 줄바꿈과 단위가 붙어 있다(예: "DMax\\r(μm)"). 첫 줄만 이름으로 쓴다.
- 용량을 줄이려고 열 단위(columnar)로 저장하고, 원소 wt%는 10배 정수(0.1 wt% 단위)로, DMax·종횡비는 100배 정수로 저장한다.
"""
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

SITE_BY_PREFIX = [
    (re.compile(r"^D(?![A-Za-z0-9-])"), "gate", "개찰구 (D구역)"),
    (re.compile(r"^B\s*-?\s*28(?!\d)", re.I), "food", "음식점 (B-28)"),
    (re.compile(r"^E\s*-?\s*43(?!\d)", re.I), "cafe", "카페·간편식 (E-43)"),
    (re.compile(r"^F\s*-?\s*1(?!\d)", re.I), "cosmetic", "화장품 (F-1)"),
    (re.compile(r"^E\s*-?\s*2(?!\d)", re.I), "clothing", "의류매장 (E-2)"),
]
ELEMENTS = {
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr",
    "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Ag", "Cd", "In", "Sn",
    "Sb", "Te", "I", "Ba", "La", "Ce", "W", "Pt", "Au", "Hg", "Pb", "Bi",
}


def clean(name: str) -> str:
    return re.split(r"[\r\n]", name)[0].strip()


def read_rows(path: Path):
    for enc in ("utf-8-sig", "cp949"):
        try:
            with path.open(encoding=enc, newline="") as f:
                rows = list(csv.reader(f))
            return [clean(c) for c in rows[0]], rows[1:]
        except UnicodeDecodeError:
            continue
    raise SystemExit(f"인코딩을 읽지 못함: {path.name}")


def num(v: str) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def main(folder: Path, out: Path):
    groups = []
    for path in sorted(folder.glob("*.csv")):
        stem = path.stem
        tag = stem.split("_")[0].strip().replace("FIlter", "Filter")
        site = next(((sid, label) for rx, sid, label in SITE_BY_PREFIX if rx.search(tag)), None)
        head, rows = read_rows(path)
        idx = {h: i for i, h in enumerate(head)}
        need = ["DMax", "Aspect"]
        miss = [h for h in need if h not in idx]
        if miss:
            print(f"건너뜀 {path.name}: 열 없음 {miss}")
            continue
        els = [h for h in head if h in ELEMENTS]
        dmax, ar = [], []
        el = {e: [] for e in els}
        sums = []
        for r in rows:
            if len(r) < len(head):
                continue
            d = num(r[idx["DMax"]])
            a = num(r[idx["Aspect"]])
            if d != d:  # NaN
                continue
            dmax.append(round(d * 100))
            ar.append(round(a * 100) if a == a else None)
            s = 0.0
            for e in els:
                v = num(r[idx[e]])
                v = 0.0 if v != v else v
                s += v
                el[e].append(round(v * 10))
            sums.append(s)
        n = len(dmax)
        # 한 번도 검출되지 않은 원소도 '측정했으나 0'으로 남긴다(측정 목록에 있었다는 뜻)
        mag = sorted({r[idx["Mag"]] for r in rows if "Mag" in idx and len(r) > idx["Mag"]})
        cls = sorted({r[idx["Classification"]] for r in rows if "Classification" in idx and len(r) > idx["Classification"]})
        groups.append({
            "id": re.sub(r"[^A-Za-z0-9-]", "", tag.replace(" ", "-")) or stem,
            "tag": tag,
            "file": path.name,
            "siteId": site[0] if site else None,
            "label": site[1] if site else tag,
            "n": n,
            "elements": els,
            "mag": mag,
            "classification": cls,
            "sumMean": round(sum(sums) / n, 2) if n else None,
            "dmax": dmax,
            "ar": ar,
            "wt10": el,
        })
        print(f"{path.name}: {n}개, 원소 {len(els)}종, 지점 {site[0] if site else '-'}")
    data = {
        "source": folder.name,
        "builtAt": date.today().isoformat(),
        "instrument": "Phenom Particle Inspector (자동 입자 검출·EDS, 배율 150×)",
        "scale": {"dmax": 100, "ar": 100, "wt": 10},
        "groups": groups,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"→ {out} ({out.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    here = Path(__file__).resolve().parent.parent
    main(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else here / "public/shared-data/large-area.json")
