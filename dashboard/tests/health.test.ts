/* 원소별 건강 영향 참고 정보 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { bytes } from "./helpers";
import { elementHealth, hasHealthInfo, parseReferences } from "../src/lib/elementHealth";
import { HEALTH_INFO } from "../src/config/healthInfo";
import { DEFAULT_HAZARD_RULES } from "../src/config/defaults";
import { DEFAULT_TARGET_ELEMENTS } from "../src/lib/elements";
import { loadTableFile } from "../src/lib/parse/loader";
import type { HazardRule } from "../src/lib/types";

describe("원소별 건강 영향 정보", () => {
  it("모든 기본 대상 원소에 건강 영향·표적 장기·출처가 있다", () => {
    for (const s of DEFAULT_TARGET_ELEMENTS) {
      const h = elementHealth(s, DEFAULT_HAZARD_RULES, DEFAULT_TARGET_ELEMENTS);
      expect(h.effects, s).toBeTruthy();
      expect(h.organs, s).toBeTruthy();
      expect(h.references.length, s).toBeGreaterThan(0);
      expect(h.isTarget).toBe(true);
    }
  });
  it("출처 URL은 공개 기관 주소(https)만 쓴다", () => {
    for (const info of Object.values(HEALTH_INFO)) {
      for (const r of parseReferences(info.health_references)) {
        if (r.url) expect(r.url).toMatch(/^https:\/\/(www\.who\.int|monographs\.iarc\.who\.int|www\.atsdr\.cdc\.gov|www\.cdc\.gov)\//);
      }
    }
  });
  it("출처 구분은 ' ; '만 — 서지 정보 안의 세미콜론은 나누지 않는다", () => {
    const refs = parseReferences(HEALTH_INFO.Fe.health_references);
    expect(refs).toHaveLength(2);
    expect(refs[1].name).toContain("2005;18:19");
    expect(refs[1].url).toBeNull();
    expect(refs[0].url).toBe("https://www.cdc.gov/niosh/npg/");
  });
  it("사용자가 입력한 건강 영향이 기본값보다 우선하고, 비우면 기본값", () => {
    const user: HazardRule[] = [{ element_symbol: "Fe", assessment_category: "x", reference_name: null, reference_year: null, reference_url: null, applicable_condition: null, classification_note: null, health_effects: "사용자 문구", health_references: "내 출처 | https://example.org" }];
    const h = elementHealth("Fe", user, DEFAULT_TARGET_ELEMENTS);
    expect(h.effects).toBe("사용자 문구");
    expect(h.source).toBe("user");
    expect(h.references).toEqual([{ name: "내 출처", url: "https://example.org" }]);
    // 이전 버전에서 저장한 규칙(건강 영향 열 없음)도 기본 정보를 보여준다
    const old: HazardRule[] = [{ element_symbol: "Ni", assessment_category: "IARC", reference_name: "r", reference_year: 2012, reference_url: null, applicable_condition: null, classification_note: null }];
    const n = elementHealth("Ni", old, DEFAULT_TARGET_ELEMENTS);
    expect(n.source).toBe("default");
    expect(n.effects).toContain("니켈");
  });
  it("근거를 등록하지 않은 원소는 내용을 만들지 않는다", () => {
    for (const s of ["Y", "F", "N", "Ca", "C", "O"]) {
      expect(hasHealthInfo(s, DEFAULT_HAZARD_RULES), s).toBe(false);
      const h = elementHealth(s, DEFAULT_HAZARD_RULES, DEFAULT_TARGET_ELEMENTS);
      expect(h.effects).toBeNull();
      expect(h.source).toBe("none");
    }
  });
  it("참고 원소(Si·Mo)는 화학종 조건을 함께 표시한다", () => {
    const si = elementHealth("Si", DEFAULT_HAZARD_RULES, DEFAULT_TARGET_ELEMENTS);
    expect(si.isTarget).toBe(false);
    expect(si.condition).toContain("결정형");
    expect(elementHealth("Mo", DEFAULT_HAZARD_RULES, DEFAULT_TARGET_ELEMENTS).condition).toContain("삼산화몰리브덴");
  });
  it("위해성 평가 규칙 템플릿의 건강 영향 열을 읽는다", () => {
    const r = loadTableFile(bytes(join(__dirname, "..", "public", "templates", "hazard_rules_template.csv")), "hazard_rules_template.csv", "user");
    expect(r.hazardRules?.[0]).toMatchObject({ element_symbol: "Cd", target_organs: "신장, 뼈, 호흡기" });
    expect(r.hazardRules?.[0].health_references).toContain("ATSDR");
  });
});
