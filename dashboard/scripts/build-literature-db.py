"""연구진 문헌 목록(마크다운, 70편)을 대시보드 문헌 데이터베이스(src/config/literatureDb.json)로 바꾼다.

사용: python scripts/build-literature-db.py "<문헌DB_70편.md 경로>"
표의 열 이름으로 값을 읽으므로 A부(용도·핵심)·B부(핵심 내용·유형·원소) 표 모양이 달라도 된다.
"""
import json
import re
import sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "src" / "config" / "literatureDb.json"

# 소제목(## A-2. 지하철 개찰구 (12편)) → 발생원 이름
SOURCE_OF_GROUP = {
    "서론·대상지 배경": "대상지 배경",
    "지하철 개찰구": "지하철 개찰구",
    "의류매장": "의류매장",
    "화장품 매장": "화장품 매장",
    "음식점": "음식점",
    "카페·간편식": "카페·간편식",
    "분석 방법": "분석 방법",
    "지하철 미세먼지 전반": "지하철 개찰구",
    "지하철 목표종 원소별": "지하철 개찰구",
}


def cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def url_of(v: str) -> str:
    v = v.strip()
    if not v or v == "—":
        return ""
    if v.startswith("http"):
        return v
    if v.startswith("10."):
        return f"https://doi.org/{v}"
    return ""


def kind_of(part: str, group: str, use: str) -> str:
    if part == "B":
        return "건강 영향"
    if group == "서론·대상지 배경":
        return "배경"
    if group == "분석 방법":
        return "분석 방법"
    if use.startswith("형상"):
        return "형상"
    if use.startswith("인체 영향"):
        return "건강 영향"
    return "목표종·조성"


def main() -> None:
    lines = SRC.read_text(encoding="utf-8").splitlines()
    part = group = ""
    header: list[str] | None = None
    entries = []
    targets = []
    section = ""
    for line in lines:
        if line.startswith("# A부"):
            part = "A"
        elif line.startswith("# B부"):
            part = "B"
        m = re.match(r"^## ([AB])-\d+\. (.+?)(?: \(\d+편\))?$", line)
        if m:
            group = m.group(2).strip()
            header = None
            section = "group"
            continue
        if line.startswith("## "):
            section = line[3:].strip()
            header = None
            continue
        if not line.startswith("|"):
            header = None
            continue
        row = cells(line)
        if header is None:
            header = row
            continue
        if set("".join(row)) <= set("-: "):
            continue
        rec = dict(zip(header, row))
        if section == "지점별 최종 목표종":
            targets.append({"site": rec["지점"], "elements": [e.strip() for e in rec["목표종"].split(",")], "refs": [r.strip() for r in rec["핵심 근거 문헌"].split(",")]})
            continue
        if section != "group" or not rec.get("No", "").strip():
            continue
        use = rec.get("용도·핵심") or rec.get("핵심 내용") or ""
        entries.append({
            "no": rec["No"],
            "part": part,
            "group": group,
            "source": SOURCE_OF_GROUP.get(group, group),
            "cite": rec["문헌"],
            "title": rec.get("제목", ""),
            "journal": rec.get("학술지", ""),
            "use": use,
            "type": rec.get("유형", ""),
            "element": rec.get("원소") or rec.get("원소·노출") or "",
            "url": url_of(rec.get("DOI·링크", "")),
            "doi": rec.get("DOI·링크", "") if rec.get("DOI·링크", "").startswith("10.") else "",
            "verified": rec.get("확인", "").strip() == "●",
            "kind": kind_of(part, group, use),
        })
    OUT.write_text(json.dumps({"source": SRC.name, "targets": targets, "entries": entries}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(entries)}편, 목표종 {len(targets)}개 지점 → {OUT}")


if __name__ == "__main__":
    main()
