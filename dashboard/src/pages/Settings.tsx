import { useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { Button, Card, Notice, PageHeader, Segmented, DemoTag } from "../components/ui";
import { DEFAULT_HAZARD_RULES, DEFAULT_SETTINGS } from "../config/defaults";
import { DEFAULT_CLASSIFICATION_RULES, validateRules } from "../lib/rules";
import { normalizeElement, elementNameKo } from "../lib/elements";
import { csvHeader, downloadText, edsLongRows, metadataRows, elementSummaryRows, hazardElementRows, hazardRuleRows, issueRows, particleResultRows, sampleComparisonRows, toCsv } from "../lib/exports";
import { elementSummaries } from "../lib/composition";
import { hazardSummary } from "../lib/hazard";
import { compareGroupsBy } from "../lib/samples";
import { buildReportHtml } from "../lib/report";
import { activeFilterCount } from "../lib/filters";
import { morphologyLabel } from "../lib/morphology";
import { loadTableFile } from "../lib/parse/loader";
import type { HazardRule } from "../lib/types";

export function SettingsPage() {
  const st = useStore();
  const { settings, setSettings, hazardRules, setHazardRules, rules, setRules, origin, filtered, particles, data, filters, allIssues, unmatched } = st;
  const [newEl, setNewEl] = useState("");
  const [rulesText, setRulesText] = useState(() => JSON.stringify(rules, null, 2));
  const [rulesMsg, setRulesMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [prepText, setPrepText] = useState(settings.preparationElements.join(", "));
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const ruleFile = useRef<HTMLInputElement>(null);
  const demo = origin === "demo";
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = demo ? "_DEMO" : "";

  const filterDesc = useMemo(() => {
    const parts: string[] = [];
    if (filters.samples.length) parts.push(`시료 ${filters.samples.join(",")}`);
    if (filters.locations.length) parts.push(`위치 ${filters.locations.join(",")}`);
    if (filters.dateFrom || filters.dateTo) parts.push(`날짜 ${filters.dateFrom ?? ""}~${filters.dateTo ?? ""}`);
    if (filters.morphologies.length) parts.push(`형상 ${filters.morphologies.map(morphologyLabel).join(",")}`);
    if (filters.element) parts.push(`원소 ${filters.element} 검출`);
    if (filters.targetStatus !== "all") parts.push(`대상 원소 ${filters.targetStatus}`);
    return parts.join(" / ");
  }, [filters]);

  const addTarget = () => {
    const s = normalizeElement(newEl);
    if (!s) return alert(`"${newEl}"를 원소 기호로 인식할 수 없습니다.`);
    if (!settings.targetElements.includes(s)) setSettings({ ...settings, targetElements: [...settings.targetElements, s] });
    setNewEl("");
  };
  const updateRule = (i: number, patch: Partial<HazardRule>) => setHazardRules(hazardRules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const exportCsv = (name: string, rows: Parameters<typeof toCsv>[0], extra: string[] = []) => {
    downloadText(`${name}${suffix}_${stamp}.csv`, toCsv(rows, csvHeader(origin, settings, [`필터: ${filterDesc || "없음"} (입자 ${filtered.length}/${particles.length})`, ...extra])));
  };
  const makeReport = () => {
    const all = allIssues;
    return buildReportHtml({
      origin, particles: filtered, allCount: particles.length, filterDescription: filterDesc, settings, hazardRules, rules,
      files: data.files, pm: data.pm, eds: data.eds, unmatched,
      issueCounts: { error: all.filter((i) => i.level === "error").length, warning: all.filter((i) => i.level === "warning").length, info: all.filter((i) => i.level === "info").length },
    });
  };
  const reportName = `SEM-EDS_report${suffix}_${stamp}.html`;
  const downloadReport = () => downloadText(reportName, makeReport(), "text/html;charset=utf-8");
  const openReport = () => {
    // 새 창으로 열고, 팝업이 막히면 HTML 파일로 내려받는다(브라우저에서 열어 인쇄 → PDF 저장)
    const url = URL.createObjectURL(new Blob([makeReport()], { type: "text/html;charset=utf-8" }));
    const w = window.open(url, "_blank");
    if (!w) {
      downloadReport();
      setReportMsg("팝업이 차단되어 보고서를 HTML 파일로 내려받았습니다. 파일을 열어 인쇄(PDF 저장)하세요.");
    } else setReportMsg(null);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <>
      <PageHeader title="분석 설정 및 결과 내보내기" description="계산 규칙과 평가 기준을 바꾸면 모든 화면이 즉시 다시 계산됩니다. 설정·규칙은 이 브라우저에 저장됩니다." />

      <Card className="mb-4" title="결과 내보내기" subtitle={`현재 필터 기준(입자 ${filtered.length}/${particles.length}${activeFilterCount(filters) ? `, ${filterDesc}` : ""}) · 모든 파일에 데이터 구분·설정을 주석(#)으로 기록 · 그래프는 각 차트의 'PNG' 버튼으로 저장`}
        actions={demo ? <DemoTag /> : undefined}>
        {!particles.length ? <p className="text-[14px] text-ink-2">내보낼 데이터가 없습니다.</p> : (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={openReport}>요약 보고서 열기(인쇄·PDF 저장)</Button>
            <Button onClick={downloadReport}>요약 보고서 HTML 내려받기</Button>
            <Button onClick={() => exportCsv("particle_results", particleResultRows(filtered, settings, rules))}>입자별 분류·검출 결과 CSV</Button>
            <Button onClick={() => exportCsv("element_summary", elementSummaryRows(elementSummaries(filtered, settings)), ["검출 빈도 분모: 원소별 판정 가능 유효 입자", "정량 통계: 검출 + 해당 기준 값 있는 입자"])}>원소 조성 요약표 CSV</Button>
            <Button onClick={() => exportCsv("target_elements", hazardElementRows(hazardSummary(filtered, settings, hazardRules).elementStats), ["평가 범주는 원소별 참고 정보이며 입자 위해도 판정이 아님"])}>대상 원소 검출 현황 CSV</Button>
            <Button onClick={() => exportCsv("sample_comparison", sampleComparisonRows(compareGroupsBy(filtered, "sample_id", settings, rules, data.pm).rows, settings.targetElements))}>시료별 비교 CSV</Button>
            <Button onClick={() => exportCsv("location_comparison", sampleComparisonRows(compareGroupsBy(filtered, "location", settings, rules, data.pm).rows, settings.targetElements))}>채취 지점별 비교 CSV</Button>
            <Button onClick={() => exportCsv("particle_metadata", metadataRows(data.meta), ["입자 메타데이터(필터 미적용, 전체) — 데이터 업로드의 일괄 업로드로 다시 불러올 수 있음"])}>입자 메타데이터 CSV</Button>
            <Button onClick={() => exportCsv("eds_long_cleaned", edsLongRows(data.eds), ["전처리 후 EDS 긴 형식(필터 미적용, 전체)"])}>정리된 EDS(긴 형식) CSV</Button>
            <Button onClick={() => exportCsv("quality_issues", issueRows(allIssues))}>품질 검사 결과 CSV</Button>
            {reportMsg && <p className="w-full text-[13.5px] text-ink-2">{reportMsg}</p>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-4">
        <Card title="위해성 평가 대상 원소" subtitle="초기 설정일 뿐이며 모든 원소를 같은 위해성 등급으로 분류하지 않습니다">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {settings.targetElements.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 border border-line-2 rounded px-2 py-0.5 text-[14px]">
                <b>{e}</b><span className="text-ink-3 text-[12.5px]">{elementNameKo(e)}</span>
                <button aria-label={`${e} 제거`} className="text-ink-3 hover:text-[#a42f2f] ml-0.5" onClick={() => setSettings({ ...settings, targetElements: settings.targetElements.filter((x) => x !== e) })}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="border border-line-2 rounded px-2 py-1 text-[14px] w-40" placeholder="원소 기호/이름" value={newEl} onChange={(e) => setNewEl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTarget()} />
            <Button onClick={addTarget}>추가</Button>
            <Button variant="ghost" onClick={() => setSettings({ ...settings, targetElements: [...DEFAULT_SETTINGS.targetElements] })}>기본값</Button>
          </div>
        </Card>

        <Card title="계산 규칙" subtitle="바꾼 값은 모든 화면·내보내기·보고서에 표시됩니다">
          <div className="space-y-3 text-[14px]">
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={settings.belowLoqCountsAsDetected} onChange={(e) => setSettings({ ...settings, belowLoqCountsAsDetected: e.target.checked })} />
              <span>정량한계 미만(LOD ≤ 값 &lt; LOQ)을 <b>검출</b>로 계수 <span className="text-ink-3">— 정량 통계(평균 등)에는 어느 경우든 포함하지 않음</span></span></label>
            <div>
              <div className="mb-1">파일에 행이 없는 원소의 해석</div>
              <Segmented value={settings.absentElementPolicy} onChange={(v) => setSettings({ ...settings, absentElementPolicy: v })} options={[{ value: "not_detected", label: "미검출로 간주(가정)" }, { value: "not_analyzed", label: "결측(미분석)" }]} />
              <p className="text-[13px] text-ink-3 mt-1">EDS 보고서가 검출된 원소만 나열한다면 '미검출로 간주', 분석 대상 원소 목록이 입자마다 다르면 '결측'을 고르세요. 결측은 원소별 분모에서 빠집니다.</p>
            </div>
            <label className="flex items-center gap-2">조성 합계 허용 범위 100 ±
              <input type="number" min={0} max={50} step={0.5} className="border border-line-2 rounded px-1.5 py-0.5 w-16 text-[14px]" value={settings.sumTolerance} onChange={(e) => setSettings({ ...settings, sumTolerance: Math.max(0, Number(e.target.value) || 0) })} />%p</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.excludeSumOutliers} onChange={(e) => setSettings({ ...settings, excludeSumOutliers: e.target.checked })} />합계 범위를 벗어난 입자를 유효 분석에서 제외</label>
            <div>
              <div className="mb-1">입자 유형·발생원 규칙의 wt% 정규화 기준</div>
              <Segmented value={settings.normalization} onChange={(v) => setSettings({ ...settings, normalization: v })} options={[{ value: "metal", label: "금속기준(C·O 제외)" }, { value: "total", label: "전체기준" }]} />
              <p className="text-[13px] text-ink-3 mt-1">같은 스펙트럼이라도 정규화 기준에 따라 Fe 값이 크게 달라질 수 있으므로 임계값은 기준과 함께 기록합니다(탄소질 규칙은 항상 전체기준).</p>
            </div>
            <div>
              <div className="mb-1">차트 기본 조성 기준</div>
              <Segmented value={settings.displayBasis} onChange={(v) => setSettings({ ...settings, displayBasis: v })} options={[{ value: "wt", label: "wt%" }, { value: "at", label: "at%" }]} />
            </div>
            <div>
              <div className="mb-1">시료 준비(코팅·기판) 유래 가능 원소</div>
              <div className="flex gap-2">
                <input className="border border-line-2 rounded px-2 py-1 text-[14px] flex-1" placeholder="예: C, Au, Pd (쉼표로 구분)" value={prepText} onChange={(e) => setPrepText(e.target.value)} />
                <Button onClick={() => setSettings({ ...settings, preparationElements: prepText.split(/[,\s]+/).map(normalizeElement).filter((x): x is string => !!x) })}>적용</Button>
              </div>
              <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={settings.preparationChecked} onChange={(e) => setSettings({ ...settings, preparationChecked: e.target.checked })} />블랭크 스펙트럼 등으로 코팅·기판 신호 영향을 확인했음</label>
            </div>
            <Button variant="ghost" onClick={() => { setSettings({ ...DEFAULT_SETTINGS, targetElements: [...DEFAULT_SETTINGS.targetElements] }); setPrepText(""); }}>계산 규칙 기본값으로</Button>
          </div>
        </Card>
      </div>

      <Card className="mb-4" title="위해성 평가 규칙" subtitle="원소별 평가 범주와 출처·적용 조건. 근거 없는 임의의 안전·위험 임계값을 만들지 않습니다. 이 범주는 참고 정보로만 표시되며 입자 위해도 판정에 쓰이지 않습니다."
        actions={
          <>
            <Button small onClick={() => ruleFile.current?.click()}>CSV 불러오기</Button>
            <Button small onClick={() => downloadText(`hazard_rules_${stamp}.csv`, toCsv(hazardRuleRows(hazardRules), ["위해성 평가 규칙 — 출처와 적용 조건을 함께 기록"]))}>CSV 내보내기</Button>
            <Button small variant="ghost" onClick={() => confirm("위해성 평가 규칙을 기본값으로 되돌립니다.") && setHazardRules(DEFAULT_HAZARD_RULES)}>기본값</Button>
            <input ref={ruleFile} type="file" accept=".csv,.xlsx" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const res = loadTableFile(new Uint8Array(await f.arrayBuffer()), f.name, "user", "hazard_rules");
              if (res.hazardRules?.length) setHazardRules(res.hazardRules);
              alert(res.hazardRules?.length ? `규칙 ${res.hazardRules.length}건을 불러왔습니다.${res.issues.length ? `\n경고 ${res.issues.length}건: ${res.issues.slice(0, 3).map((i) => i.message).join(" / ")}` : ""}` : `불러오지 못했습니다: ${res.issues.map((i) => i.message).join(" / ")}`);
            }} />
          </>
        }>
        <Notice kind="info">기본값에는 출처를 확인할 수 있는 IARC 발암성 분류만 넣었고, 나머지 원소는 '평가 대상(범주 미입력)'입니다. IARC 분류는 <b>화학종</b>(예: 6가 크롬 화합물) 기준이며 EDS는 화학종을 구분하지 못합니다. 사용 전 원문을 확인하세요.</Notice>
        <div className="overflow-auto mt-3">
          <table className="data">
            <thead><tr><th>원소</th><th>평가 범주</th><th>근거(reference_name)</th><th>연도</th><th>URL</th><th>적용 조건</th><th>비고</th><th>표적 장기</th><th>노출 시 건강 영향(비우면 기본 참고 정보)</th><th>건강 영향 출처("이름 | URL ; …")</th><th></th></tr></thead>
            <tbody>
              {hazardRules.map((r, i) => (
                <tr key={i}>
                  <td className="font-semibold">{r.element_symbol}</td>
                  {(["assessment_category", "reference_name", "reference_year", "reference_url", "applicable_condition", "classification_note", "target_organs", "health_effects", "health_references"] as const).map((k) => (
                    <td key={k}>
                      <input className={`border border-line rounded px-1.5 py-0.5 text-[13px] w-full ${k === "reference_year" ? "min-w-[60px]" : k === "health_effects" || k === "health_references" ? "min-w-[260px]" : "min-w-[140px]"}`} value={r[k] ?? ""}
                        onChange={(e) => updateRule(i, { [k]: k === "reference_year" ? (e.target.value ? Number(e.target.value) || null : null) : e.target.value || null } as Partial<HazardRule>)} />
                    </td>
                  ))}
                  <td><button className="text-ink-3 hover:text-[#a42f2f] text-[13px]" onClick={() => setHazardRules(hazardRules.filter((_, j) => j !== i))}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex gap-2">
            {[...new Set([...settings.targetElements, ...DEFAULT_HAZARD_RULES.map((r) => r.element_symbol)])].filter((e) => !hazardRules.find((r) => r.element_symbol === e)).map((e) => (
              <Button small key={e} onClick={() => setHazardRules([...hazardRules, DEFAULT_HAZARD_RULES.find((r) => r.element_symbol === e) ?? { element_symbol: e, assessment_category: "평가 대상(범주 미입력)", reference_name: null, reference_year: null, reference_url: null, applicable_condition: null, classification_note: null }])}>+ {e} 규칙 행{DEFAULT_HAZARD_RULES.some((r) => r.element_symbol === e) ? "(기본값)" : ""}</Button>
            ))}
          </div>
        </div>
      </Card>

      <Card title="입자 유형·발생원 후보 규칙 (JSON)" subtitle="코드와 분리된 규칙 파일(src/config/classificationRules.default.json). 조건 종류: min, max, sumMin, sumMax, ratioBetween, detected, anyDetected, morphologyIn, requiresBackground">
        {rules.thresholdProvenance && <p className="text-[13.5px] text-ink-2 mb-2">임계값 출처: {rules.thresholdProvenance}</p>}
        <textarea className="w-full h-[360px] font-mono text-[13px] border border-line-2 rounded p-2" spellCheck={false} value={rulesText} onChange={(e) => setRulesText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Button variant="primary" onClick={() => {
            try {
              const v = validateRules(JSON.parse(rulesText));
              if (!v.ok) return setRulesMsg({ ok: false, text: v.error });
              setRules(v.rules);
              setRulesMsg({ ok: true, text: `적용했습니다 — 입자 유형 ${v.rules.particleTypes.length}개, 발생원 후보 ${v.rules.sourceCandidates.length}개` });
            } catch (e) {
              setRulesMsg({ ok: false, text: `JSON 구문 오류: ${(e as Error).message}` });
            }
          }}>검사 후 적용</Button>
          <Button onClick={() => downloadText(`classification_rules_${stamp}.json`, JSON.stringify(rules, null, 2), "application/json")}>현재 규칙 내보내기</Button>
          <Button variant="ghost" onClick={() => { setRules(DEFAULT_CLASSIFICATION_RULES); setRulesText(JSON.stringify(DEFAULT_CLASSIFICATION_RULES, null, 2)); setRulesMsg({ ok: true, text: "기본 규칙으로 되돌렸습니다." }); }}>기본값</Button>
          {rulesMsg && <span className={`text-[13.5px] ${rulesMsg.ok ? "text-[#0a6b0a]" : "text-[#a42f2f]"}`}>{rulesMsg.ok ? "✓ " : "✕ "}{rulesMsg.text}</span>}
        </div>
      </Card>
    </>
  );
}
