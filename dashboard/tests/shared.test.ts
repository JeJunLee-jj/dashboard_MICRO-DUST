/* 팀 공유 데이터셋(백업 파일 형식) 읽기 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { FIX, bytes, settings } from "./helpers";
import { readBackupObject, BACKUP_FORMAT } from "../src/lib/persist";
import { readTables } from "../src/lib/parse/tabular";
import { buildParticleFromPair } from "../src/lib/register";
import { joinState } from "../src/lib/dataset";
import { EMPTY_DATASET } from "../src/lib/dataset";

// 1×1 PNG
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function backupObject(origin: "user" | "demo") {
  const edsTable = readTables(bytes(join(FIX, "phenom_quantification.csv")), "quantification (1).csv").tables[0];
  const r = buildParticleFromPair({
    sample_id: "261008_Local", particle_id: "P001", location: null, date: "2026-10-08", sample_type: "측정",
    morphology: null, morphologyMethod: null, notes: null, image: null, pixelSizeUm: 0.0134896,
    edsName: "q.csv", edsTable, measurement: null,
  });
  return {
    format: BACKUP_FORMAT, version: 1, savedAt: "2026-10-12T06:00:00.000Z", note: "test",
    data: { ...EMPTY_DATASET, origin, meta: [{ ...r.meta, image_filename: "p.png" }], eds: r.eds },
    images: [{ filename: "p.png", dataUrl: PNG_1PX, width: 1, height: 1, origin, note: null, synthetic: false, instrument: null }],
    extras: { settings: { ...settings(), targetElements: ["Fe", "Pb"] } },
  };
}

describe("팀 공유 데이터셋", () => {
  it("백업 객체를 데이터셋으로 복원하고 이미지·입자를 다시 연결한다", async () => {
    const r = await readBackupObject(backupObject("user"));
    expect(r.savedAt).toBe("2026-10-12T06:00:00.000Z");
    expect(r.state.images[0].url.startsWith("blob:")).toBe(true);
    const { particles } = joinState(r.state, settings());
    expect(particles).toHaveLength(1);
    expect(particles[0].image?.filename).toBe("p.png");
    expect(particles[0].wtSum).toBeCloseTo(100, 3);
    expect((r.extras.settings as { targetElements: string[] }).targetElements).toEqual(["Fe", "Pb"]);
  });
  it("형식이 다른 파일은 거부한다", async () => {
    await expect(readBackupObject({ format: "other" })).rejects.toThrow("백업 파일이 아닙니다");
  });
  it("DEMO 백업이면 origin이 demo로 남는다(배포 스크립트가 거부하는 근거)", async () => {
    const r = await readBackupObject(backupObject("demo"));
    expect(r.state.origin).toBe("demo");
  });
});
