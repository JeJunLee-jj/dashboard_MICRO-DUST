import { describe, expect, it } from "vitest";
import { convexHull, hullMean, insideHull, isolines, sampleGrid, sibsonGrid } from "../src/lib/interp";

describe("면적 가중(자연이웃) 보간", () => {
  const pts = [{ x: 0.2, y: 0.5, v: 30 }, { x: 0.8, y: 0.5, v: 70 }];
  const g = sibsonGrid(pts, 60, 30);
  it("측정 지점 위에서는 그 지점 값", () => {
    expect(sampleGrid(g, 0.2, 0.5)).toBeCloseTo(30, 0);
    expect(sampleGrid(g, 0.8, 0.5)).toBeCloseTo(70, 0);
  });
  it("두 지점 한가운데는 평균, 값은 측정값 범위를 넘지 않는다", () => {
    expect(sampleGrid(g, 0.5, 0.5)).toBeCloseTo(50, 0);
    for (const v of g.values) { expect(v).toBeGreaterThanOrEqual(30); expect(v).toBeLessThanOrEqual(70); }
  });
  it("가까운 지점 쪽으로 기운다", () => {
    expect(sampleGrid(g, 0.35, 0.5)).toBeLessThan(50);
  });
  it("볼록 껍질과 면적 가중 평균", () => {
    const four = [{ x: 0.1, y: 0.1, v: 0 }, { x: 0.9, y: 0.1, v: 0 }, { x: 0.9, y: 0.9, v: 100 }, { x: 0.1, y: 0.9, v: 100 }, { x: 0.5, y: 0.5, v: 50 }];
    const hull = convexHull(four);
    expect(hull).toHaveLength(4);
    expect(insideHull(hull, 0.5, 0.5)).toBe(true);
    expect(insideHull(hull, 0.05, 0.5)).toBe(false);
    expect(hullMean(sibsonGrid(four, 40, 40), hull)!).toBeCloseTo(50, 0);
  });
  it("등고선은 두 지점 사이를 가로지른다", () => {
    const segs = isolines(g, 50);
    expect(segs.length).toBeGreaterThan(0);
    for (const [x1, , x2] of segs) { expect(x1).toBeGreaterThan(0.35); expect(x2).toBeLessThan(0.65); }
  });
});
