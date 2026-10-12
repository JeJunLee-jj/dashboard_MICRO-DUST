/* 분석 결과 요약 보고서(HTML). 새 창에서 열어 인쇄(PDF로 저장)한다.
   데이터 범위, 분석 입자 수, 계산식, 주요 결과, 분석 한계와 주의사항을 담는다. */
import type { AnalysisSettings, DataOrigin, HazardRule, LoadedFile, Particle, PmRecord, EdsRecord } from "./types";
import type { ClassificationRules } from "./rules";
import type { Unmatched } from "./join";
import { computeKpis } from "./filters";
import { hazardSummary, HAZARD_DISCLAIMER, massConcentrationAssessment } from "./hazard";
import { elementSummaries } from "./composition";
import { compareGroupsBy } from "./samples";
import { morphologyDistribution } from "./viewModels";
import { followUps, STANDING_LIMITATIONS } from "./limitations";
import { classifyParticleType } from "./rules";
import { originLabel } from "./exports";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pct = (k: number, n: number) => (n ? `${((k / n) * 100).toFixed(1)}% (${k}/${n})` : "— (분모 0)");
const f2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));

export interface ReportInput {
  origin: DataOrigin | null;
  particles: Particle[];          // 필터 적용된 입자
  allCount: number;
  filterDescription: string;
  settings: AnalysisSettings;
  hazardRules: HazardRule[];
  rules: ClassificationRules;
  files: LoadedFile[];
  pm: PmRecord[];
  eds: EdsRecord[];
  unmatched: Unmatched;
  issueCounts: { error: number; warning: number; info: number };
}

export function buildReportHtml(r: ReportInput): string {
  const { particles, settings } = r;
  const demo = r.origin === "demo";
  const k = computeKpis(particles, settings);
  const h = hazardSummary(particles, settings, r.hazardRules);
  const els = elementSummaries(particles, settings).filter((e) => e.detected > 0).sort((a, b) => b.detected - a.detected);
  const groups = compareGroupsBy(particles, "sample_id", settings, r.rules, r.pm);
  const morph = morphologyDistribution(particles);
  const types = new Map<string, number>();
  for (const p of particles.filter((x) => x.edsValid)) {
    const t = classifyParticleType(p, settings, r.rules).label;
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  const dates = [...new Set(particles.map((p) => p.date).filter(Boolean))].sort();
  const locs = [...new Set(particles.map((p) => p.location).filter(Boolean))];
  const samples = [...new Set(particles.map((p) => p.sample_id))];
  const todo = followUps(particles, r.eds, settings, r.hazardRules, r.unmatched);

  const table = (head: string[], rows: Array<Array<unknown>>) =>
    `<table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${demo ? "[DEMO] " : ""}SEM-EDS 입자 분석 요약 보고서</title>
<style>
body{font-family:"IBM Plex Sans KR","Malgun Gothic",sans-serif;color:#131a18;margin:28px 36px;font-size:12.5px;line-height:1.6}
h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #c8d0cd;padding-bottom:3px}
table{border-collapse:collapse;width:100%;margin:6px 0} th,td{border:1px solid #dde3e1;padding:3px 6px;text-align:left;vertical-align:top} th{background:#f3f5f4}
.demo{border:2px solid #c9902a;background:repeating-linear-gradient(135deg,#fff4d6 0 12px,#fde9b0 12px 24px);padding:8px 12px;font-weight:600;color:#5c3d00;margin:10px 0}
.warn{border:1px solid #f0d08a;background:#fff8e6;padding:8px 12px;margin:8px 0}
.formula{background:#f3f5f4;border:1px solid #dde3e1;padding:6px 10px;margin:6px 0}
.muted{color:#5f6b68} ul{margin:4px 0;padding-left:20px}
@media print{body{margin:12mm} .noprint{display:none}}
</style></head><body>
<div class="noprint" style="text-align:right"><button onclick="window.print()">인쇄 / PDF로 저장</button></div>
<h1>SEM-EDS 기반 미세먼지 입자 분석 요약 보고서</h1>
<div class="muted">생성: ${esc(new Date().toLocaleString("ko-KR"))} · 데이터 구분: <b>${esc(originLabel(r.origin))}</b></div>
${demo ? `<div class="demo">DEMO 보고서 — 이 보고서의 모든 수치는 가상의 예시 데이터에서 계산되었습니다. 실제 측정 결과가 아니며 어떤 실제 시료의 분석 결과로도 사용·인용할 수 없습니다.</div>` : ""}

<h2>1. 데이터 범위</h2>
<ul>
<li>분석 대상: 필터 적용 후 입자 ${k.total}개 (전체 ${r.allCount}개) — 필터: ${esc(r.filterDescription || "없음")}</li>
<li>시료: ${esc(samples.join(", ") || "—")}</li>
<li>채취 지점: ${esc(locs.join(", ") || "미기재")}</li>
<li>채취 기간: ${esc(dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "미기재")}</li>
<li>데이터 파일: ${esc(r.files.map((f) => f.name).join(", ") || "—")}</li>
<li>품질 검사: 오류 ${r.issueCounts.error}건, 경고 ${r.issueCounts.warning}건, 안내 ${r.issueCounts.info}건</li>
</ul>

<h2>2. 분석 설정과 계산식</h2>
<ul>
<li>위해성 평가 대상 원소(초기 설정, 동일 등급 아님): ${esc(settings.targetElements.join(", "))}</li>
<li>정량한계 미만: ${settings.belowLoqCountsAsDetected ? "검출로 계수(정량 통계에서는 제외)" : "검출로 계수하지 않음"}</li>
<li>파일에 행이 없는 원소: ${settings.absentElementPolicy === "not_detected" ? "미검출로 간주(가정)" : "결측(미분석)으로 처리"}</li>
<li>조성 합계 허용 범위: 100 ± ${settings.sumTolerance}%p (${settings.excludeSumOutliers ? "벗어나면 유효 분석에서 제외" : "벗어나도 경고만"})</li>
<li>입자 유형·발생원 분류: 규칙 기반(조성 임계값, wt% ${settings.normalization === "metal" ? "금속기준: C·O 제외 재정규화" : "전체기준"}), 규칙 버전 ${esc(r.rules.version)}</li>
</ul>
<div class="formula">대상 원소 검출 입자 비율(%) = 대상 원소가 하나 이상 검출된 입자 수 ÷ 판정 가능한 유효 분석 입자 수 × 100. 한 입자의 복수 원소 검출은 1개로 계수. 대상 원소 미검출이지만 일부 결측인 입자는 분모에서 제외.</div>
<div class="formula">원소별 검출 빈도 = 해당 원소 검출 입자 수 ÷ 해당 원소를 판정할 수 있는 유효 입자 수(원소별 분모). 신뢰구간: Wilson 95%.</div>
<div class="formula">원소 조성 통계(평균·중앙값·표본표준편차·사분위수)는 상태가 '검출'이고 해당 기준(wt% 또는 at%) 값이 있는 입자만 사용. wt%와 at%는 따로 계산하며 서로 환산하지 않음.</div>

<h2>3. 주요 결과</h2>
${table(["지표", "값"], [
  ["총 분석 입자 수", k.total],
  ["유효 EDS 분석 입자 수", `${k.validEds} (${pct(k.validEds, k.total)})`],
  ["검출된 원소 종류 수", k.elementKinds],
  ["대상 원소 검출 입자 비율", `${pct(h.positive, h.targetRatio.denominator)}${h.targetRatio.ci ? ` · 95% CI ${(h.targetRatio.ci.lo * 100).toFixed(1)}–${(h.targetRatio.ci.hi * 100).toFixed(1)}%` : ""}`],
  ["판정 불가(대상 원소 결측) 입자", h.undetermined],
  ["대상 원소 2개 이상 동시 검출 입자 비율", pct(h.multi[2].numerator, h.multi[2].denominator)],
  ["형상 분류 완료 비율", `${pct(k.morphClassified, k.total)} · 판별 불가 ${k.morphUndetermined}`],
])}
<h3>대상 원소별 검출 현황</h3>
${table(["원소", "검출/판정 가능", "LOQ 미만", "LOD 미만", "미검출", "결측", "wt% 중앙값 (n)", "평가 범주(참고)"], h.elementStats.map((e) => [
  e.symbol, pct(e.detected, e.evaluable), e.belowLoq, e.belowLod, e.notDetected, e.missing, e.wt.n ? `${f2(e.wt.median)} (${e.wt.n})` : "—",
  e.rule ? (e.rule.reference_name ? `${e.rule.assessment_category} — ${e.rule.reference_name}` : "근거 미입력") : "규칙 없음",
]))}
<h3>원소별 검출 빈도와 wt% 조성 (상위 15)</h3>
${table(["원소", "검출 빈도", "wt% 평균 ± SD", "wt% 중앙값 [Q1–Q3]", "정량 n"], els.slice(0, 15).map((e) => [e.symbol, pct(e.detected, e.evaluable), e.wt.n ? `${f2(e.wt.mean)} ± ${f2(e.wt.sd)}` : "—", e.wt.n ? `${f2(e.wt.median)} [${f2(e.wt.q1)}–${f2(e.wt.q3)}]` : "—", e.wt.n]))}
<h3>형상 분포</h3>
${table(["형상", "입자 수", "비율"], morph.map((m) => [m.label, m.count, pct(m.count, k.total)]))}
<h3>입자 유형(규칙 기반 후보)</h3>
${table(["입자 유형", "유효 입자 수"], [...types.entries()].sort((a, b) => b[1] - a[1]))}
<h3>시료별 비교</h3>
${table(["시료", "위치", "유효 입자", "대상 원소 검출 비율", "95% CI"], groups.rows.map((g) => [g.group, g.location ?? "—", g.valid, pct(g.positive, g.determinable), g.ci ? `${(g.ci.lo * 100).toFixed(1)}–${(g.ci.hi * 100).toFixed(1)}%` : "—"]))}
${groups.pairwise.length ? table(["비교", "Fisher p", "Holm 보정 p"], groups.pairwise.map((x) => [`${x.a} vs ${x.b}`, x.p.toPrecision(2), x.pAdj.toPrecision(2)])) : ""}

<h2>4. 계산하지 않은 지표(분석 불가)</h2>
<ul>${massConcentrationAssessment().map((m) => `<li><b>${esc(m.metric)}</b>: ${esc(m.reasons.join(" "))}</li>`).join("")}</ul>

<h2>5. 분석 한계와 주의사항</h2>
<div class="warn">${esc(HAZARD_DISCLAIMER)}</div>
<ul>${STANDING_LIMITATIONS.map((x) => `<li>${esc(x)}</li>`).join("")}
<li>탄소 코팅·기판 신호 영향: ${settings.preparationChecked ? "확인함(사용자 표시)" : "확인되지 않음"}</li></ul>

<h2>6. 추가 조사가 필요한 항목</h2>
<ul>${todo.map((t) => `<li><b>${esc(t.item)}</b>${t.count != null ? ` (${t.count})` : ""} — ${esc(t.detail)}</li>`).join("")}</ul>

<p class="muted">본 보고서는 SEM-EDS 입자 분석 대시보드에서 업로드 데이터로부터 자동 계산되었습니다. 발생원은 후보이며 확정이 아닙니다.</p>
</body></html>`;
}
