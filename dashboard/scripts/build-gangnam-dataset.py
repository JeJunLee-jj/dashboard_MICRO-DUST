"""강남역 지하상가 5개 지점 단일입자 데이터(Phenom export)를 대시보드 공유 데이터셋(백업 형식)으로 만든다.

사용:  python scripts/build-gangnam-dataset.py <원본 261022 폴더> <형상 측정 shape.json> [출력 경로]
  - 입자 = export 폴더의 '<입자>.tiff' + '<입자>_analysis_1~3_spot/quantification.csv'
  - 원소 조성 = 스폿 3곳 평균(스폿에서 미검출인 원소는 0으로 평균), 스폿별 값은 meta.spot_wt 에 보관
  - 형상(종횡비·최대 Feret) = EDS 스폿 위치를 씨앗으로 한 자동 분할 결과(shape.json) — 섬유 필터 배경 때문에
    일부 윤곽이 부정확하므로 '검토 필요'로 표시한다.
  - 맵·영역(analysis_4) 정량값은 필터 바탕이 섞인 전체 시야 값이라 쓰지 않는다.
"""
import base64, csv, glob, io, json, os, re, statistics as st, sys
from datetime import datetime, timedelta, timezone
from PIL import Image

ROOT = sys.argv[1]
SHAPE = {(r["site"], r["particle"]): r for r in json.load(open(sys.argv[2], encoding="utf-8"))}
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "..", "public", "shared-data", "dataset.json")

# sites.ts 의 label 과 같아야 위치가 자동 지정된다
SITES = [("261021_D", "개찰구 (D구역)"), ("261022_B-28", "음식점 (B-28)"), ("261021_E-43", "카페·간편식 (E-43)"),
         ("261022_F-1", "화장품 (F-1)"), ("261022_E-2", "의류매장 (E-2)")]


def pkey(n):
    m = re.match(r"(\D+?)\s*(\d+)$", n)
    return (m.group(1), int(m.group(2)))


def read_q(path):
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            out[r["Element symbol"]] = (r["Element name"], float(r["Weight concentration percentage"]) * 100,
                                        float(r["Atomic concentration percentage"]) * 100)
    return out


def xml_meta(img):
    xml = img.tag_v2.get(34683, b"")
    xml = xml.decode("latin-1") if isinstance(xml, bytes) else str(xml)
    g = lambda k: (re.search(rf"<{k}(?:\s[^>]*)?>([^<]*)</{k}>", xml) or [None, None])[1]
    num = lambda k: float(g(k)) if g(k) not in (None, "") else None
    px = num("pixelWidth")
    hv = num("highVoltage")
    wd = num("workingDistance")
    t = g("time")
    return {
        "source": "phenom-xml", "instrument": (g("instrumentName") or g("type") or "Phenom XL G2"),
        "softwareVersion": g("softwareVersion"), "label": g("label"),
        "pixelWidthUm": px / 1000 if px else None, "pixelHeightUm": px / 1000 if px else None,
        "fieldWidthUm": px / 1000 * img.width if px else None,
        "magnification": None, "databarHeightPx": int(num("databarHeight") or 0) or None,
        "acquiredAtUtc": (t + "Z") if t and not t.endswith("Z") else t,
        "highVoltageKv": abs(hv) / 1000 if hv and abs(hv) > 100 else (abs(hv) if hv else None),
        "workingDistanceMm": wd * 1000 if wd and wd < 1 else wd,
        "detector": g("detector"), "spotSize": num("spotSize"), "dwellTimeNs": None, "integrations": None, "pressurePa": num("pressure"),
    }


meta, eds, images, files, issues = [], [], [], [], []
now = datetime.now(timezone.utc).isoformat()
for site, label in SITES:
    exp = glob.glob(os.path.join(ROOT, site, "EDS", "*", "export"))[0]
    parts = sorted({re.match(r"(.+)_analysis_\d+_spot$", os.path.basename(d)).group(1)
                    for d in glob.glob(os.path.join(exp, "*_analysis_*_spot"))}, key=pkey)
    for p in parts:
        spots = [read_q(q) for q in sorted(glob.glob(os.path.join(exp, f"{p}_analysis_*_spot", "quantification.csv")))]
        els = sorted({e for s in spots for e in s})
        # 입자 사진 = 지점 SEM 폴더에서 번호가 같은 사진(SEM Local N ↔ EDS Local N·Image N)
        pn = int(re.findall(r"\d+", p)[-1])
        sem = [f for f in glob.glob(os.path.join(ROOT, site, "SEM", "*.tif*")) if int(re.findall(r"\d+", os.path.basename(f).rsplit(".", 1)[0])[-1]) == pn]
        tif = sem[0] if sem else os.path.join(exp, f"{p}.tiff")
        img = Image.open(tif)
        inst = xml_meta(img)
        fname = f"{site}__{os.path.basename(tif)}"
        local = None
        if inst["acquiredAtUtc"]:
            local = datetime.fromisoformat(inst["acquiredAtUtc"].replace("Z", "+00:00")) + timedelta(hours=9)
        shp = SHAPE.get((site, p))
        um = inst["pixelWidthUm"]
        meta.append({
            "sample_id": site, "particle_id": p,
            "collection_date": local.strftime("%Y-%m-%d") if local else None,
            "collection_location": label, "image_filename": fname, "magnification": None,
            "scale_bar_value": None, "scale_bar_unit": None, "scale_bar_px": None, "pixel_size_um": um,
            "morphology_class": None, "morphology_raw": None,
            "projected_area": round(shp["area_um2"], 3) if shp else None,
            "equivalent_diameter": round(shp["eqd_um"], 3) if shp else None,
            "classification_method": None,
            "feret_diameter": round(shp["feret_um"], 3) if shp else None,
            "circularity": None,
            "solidity": round(shp["solidity"], 3) if shp else None,
            "aspect_ratio": round(shp["ar"], 3) if shp else None,
            "size_method": "EDS 스폿 위치를 씨앗으로 한 자동 분할(섬유 필터 배경) — 윤곽 미확인, 검토 필요" if shp else None,
            "accelerating_voltage_kv": inst["highVoltageKv"], "working_distance_mm": inst["workingDistanceMm"],
            "detector": inst["detector"], "instrument": inst["instrument"],
            "acquired_at": local.strftime("%Y-%m-%d %H:%M") if local else None,
            "sample_type": "측정",
            "analysis_conditions": f"Phenom XL G2, EDS 스폿 {len(spots)}곳 평균",
            "notes": None,
            "spot_wt": {e: [round(s[e][1], 3) if e in s else 0 for s in spots] for e in els},
            "sourceFile": f"{site}/export/{p}", "sourceRow": 0,
        })
        for e in els:
            name = next(s[e][0] for s in spots if e in s)
            wt = st.mean(s[e][1] if e in s else 0 for s in spots)
            at = st.mean(s[e][2] if e in s else 0 for s in spots)
            eds.append({"sample_id": site, "particle_id": p, "element_symbol": e, "element_name": name,
                        "wt_percent": round(wt, 4), "at_percent": round(at, 4),
                        "detection_status": "detected" if wt > 0 else "not_detected", "status_source": "explicit",
                        "detection_limit": None, "quantification_limit": None,
                        "measurement_method": f"EDS 스폿 {len(spots)}곳 평균(Phenom quantification.csv)",
                        "normalized": True, "sourceFile": f"{p}_analysis_*_spot/quantification.csv", "sourceRow": 0})
        buf = io.BytesIO()
        rgb = img.convert("L")
        k = 1280 / rgb.width if rgb.width > 1280 else 1
        if k < 1:
            rgb = rgb.resize((1280, round(rgb.height * k)), Image.LANCZOS)
            for key in ("pixelWidthUm", "pixelHeightUm"):
                if inst[key]:
                    inst[key] = inst[key] / k
            if inst["databarHeightPx"]:
                inst["databarHeightPx"] = round(inst["databarHeightPx"] * k)
        rgb.save(buf, "JPEG", quality=85)
        images.append({"filename": fname, "width": rgb.width, "height": rgb.height, "origin": "user",
                       "note": ("SEM 입자 사진(" + os.path.basename(tif) + ")") if sem else "EDS 분석 화면(같은 번호 SEM 사진 없음)", "synthetic": False, "instrument": inst,
                       "dataUrl": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()})
        files.append({"name": f"{site}/{p}", "kind": "pair", "rows": 1, "origin": "user", "loadedAt": now, "note": label})
        if site == "261022_F-1" and p.startswith("Image"):
            issues.append({"level": "warning", "code": "FE_NOT_IN_ELEMENT_LIST", "particleKey": f"{site}::{p}",
                           "message": "Phenom 원소 목록에 Fe 대신 Mn이 들어간 채 정량되었습니다(스펙트럼에는 Fe 피크 있음). Fe를 넣어 다시 정량해야 합니다."})
        if not shp:
            issues.append({"level": "info", "code": "NO_SHAPE", "particleKey": f"{site}::{p}", "message": "형상(종횡비) 측정값이 없습니다."})
issues.append({"level": "warning", "code": "POSSIBLE_DUPLICATE", "particleKey": "261022_F-1::Image 8",
               "message": "F-1 Image 7과 Image 8은 같은 시야(같은 입자)를 두 번 분석한 것으로 보입니다."})

out = {"format": "semeds-dashboard-backup", "version": 1, "savedAt": now,
       "note": "강남역 지하상가 5개 지점 단일입자(최대 길이 무관 전체) — EDS 스폿 3곳 평균, 형상은 자동 분할(검토 필요)",
       "data": {"origin": "user", "meta": meta, "eds": eds, "pm": [], "files": files, "issues": issues, "edsSummaries": [], "overrides": {}},
       "images": images, "extras": {}}
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(f"particles={len(meta)} eds={len(eds)} images={len(images)} size={os.path.getsize(OUT)/1e6:.1f}MB -> {OUT}")
