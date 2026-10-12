import { describe, expect, it } from "vitest";
import { describe as desc, fisherExact, holm, quantile, spearman, wilson, pearson, ranks } from "../src/lib/stats";

describe("기술통계", () => {
  it("평균·중앙값·표본표준편차·사분위수(type 7)", () => {
    const d = desc([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(d.n).toBe(8);
    expect(d.mean).toBe(5);
    expect(d.median).toBe(4.5);
    expect(d.sd).toBeCloseTo(2.13809, 4);
    expect(d.q1).toBe(4);
    expect(d.q3).toBeCloseTo(5.5);
    expect(d.min).toBe(2);
    expect(d.max).toBe(9);
  });
  it("값이 없으면 모두 null, 하나면 표준편차 null", () => {
    expect(desc([]).mean).toBeNull();
    expect(desc([3]).sd).toBeNull();
  });
  it("quantile 보간", () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
  });
});

describe("비율 신뢰구간과 검정", () => {
  it("Wilson 95% 신뢰구간", () => {
    const ci = wilson(5, 6)!;
    expect(ci.lo).toBeCloseTo(0.4365, 3);
    expect(ci.hi).toBeCloseTo(0.9699, 3);
    expect(wilson(0, 0)).toBeNull();
    const zero = wilson(0, 10)!;
    expect(zero.lo).toBe(0);
    expect(zero.hi).toBeGreaterThan(0.2);
  });
  it("Fisher 정확검정(양측)", () => {
    expect(fisherExact(1, 9, 11, 3)).toBeCloseTo(0.002759, 5);
    expect(fisherExact(3, 1, 1, 3)).toBeCloseTo(0.4857, 4);
    expect(fisherExact(0, 0, 0, 0)).toBe(1);
  });
  it("Holm 보정", () => {
    const adj = holm([0.01, 0.04, 0.03]);
    expect(adj[0]).toBeCloseTo(0.03);
    expect(adj[1]).toBeCloseTo(0.06);
    expect(adj[2]).toBeCloseTo(0.06);
  });
  it("Spearman(동순위 평균 순위)", () => {
    expect(ranks([5, 6, 7, 8, 7])).toEqual([1, 2, 3.5, 5, 3.5]);
    expect(spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7])).toBeCloseTo(0.8208, 4);
    expect(pearson([1, 2, 3], [1, 1, 1])).toBeNull();
    expect(spearman([1, 2], [2, 1])).toBeNull();
  });
});
