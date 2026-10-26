"""강남역 지하상가 공기청정기 포집 입자 20개(P001~P020, 이전 공유 데이터셋)를 공유 데이터셋에 '참고' 그룹으로 추가.
사용: python scripts/add-airpurifier.py <이전 dataset.json> [공유 dataset.json]
형상(최대 Feret, 종횡비)은 사진 중앙을 씨앗으로 한 자동 분할 결과(scripts/airpurifier-shape.json) — 검토 필요."""
import base64, io, json, os, sys
from PIL import Image
OLD = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "public", "shared-data", "dataset.json")
SHAPE = json.load(open(os.path.join(os.path.dirname(__file__), "airpurifier-shape.json"), encoding="utf-8"))
PARTIAL = {"P002", "P010"}
old = json.load(open(OLD, encoding="utf-8"))
new = json.load(open(OUT, encoding="utf-8"))
new["data"]["meta"] = [m for m in new["data"]["meta"] if m["sample_id"] != "261008_Local"]
new["data"]["eds"] = [e for e in new["data"]["eds"] if e["sample_id"] != "261008_Local"]
new["images"] = [i for i in new["images"] if not i["filename"].startswith("261008_")]
imgs = {i["filename"]: i for i in old["images"]}
for m in old["data"]["meta"]:
    s = SHAPE[m["particle_id"]]
    m.update({"collection_location": "공기청정기(지하상가, 참고)", "sample_type": "참고(공기청정기 포집)",
              "feret_diameter": round(s["feret"], 3), "equivalent_diameter": round(s["eqd"], 3), "projected_area": round(s["area"], 3),
              "aspect_ratio": round(s["ar"], 3), "solidity": round(s["sol"], 3),
              "size_method": "사진 중앙을 씨앗으로 한 자동 분할 — 윤곽 미확인, 검토 필요" + (" (윤곽이 입자 일부만 잡힘)" if m["particle_id"] in PARTIAL else ""),
              "notes": "강남역 지하상가 공기청정기 포집 시료(5개 지점 비교에는 포함하지 않음)"})
    new["data"]["meta"].append(m)
    im = imgs[m["image_filename"]]
    pil = Image.open(io.BytesIO(base64.b64decode(im["dataUrl"].split(",", 1)[1]))).convert("L")
    k = 1280 / pil.width
    pil = pil.resize((1280, round(pil.height * k)), Image.LANCZOS)
    buf = io.BytesIO(); pil.save(buf, "JPEG", quality=85)
    inst = dict(im.get("instrument") or {})
    for key in ("pixelWidthUm", "pixelHeightUm"):
        if inst.get(key): inst[key] = inst[key] / k
    if inst.get("databarHeightPx"): inst["databarHeightPx"] = round(inst["databarHeightPx"] * k)
    new["images"].append({**{x: im[x] for x in ("filename", "origin", "synthetic")}, "width": pil.width, "height": pil.height,
                          "note": "SEM 입자 사진(공기청정기 포집)", "instrument": inst,
                          "dataUrl": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()})
new["data"]["eds"] += [e for e in old["data"]["eds"]]
new["note"] = "강남역 지하상가 5개 지점 단일입자 51개 + 공기청정기 포집 입자 20개(참고) — EDS 스폿 평균, 형상은 자동 분할(검토 필요)"
json.dump(new, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("particles", len(new["data"]["meta"]), "size MB", round(os.path.getsize(OUT) / 1e6, 1))
