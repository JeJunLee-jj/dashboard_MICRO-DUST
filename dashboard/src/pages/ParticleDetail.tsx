import { useMemo, useState } from "react";
import { useStore, hrefFor } from "../state/store";
import { Card, DemoTag, LevelBadge, Notice, StatusBadge, TargetBadge, fmtNum, Button } from "../components/ui";
import { ImageViewer } from "../components/ImageViewer";
import { elementStatus } from "../lib/join";
import { particleTargetResult } from "../lib/hazard";
import { classifyParticleType, sourceCandidates } from "../lib/rules";
import { topElements } from "../lib/composition";
import { MORPHOLOGY_CLASSES, morphologyLabel } from "../lib/morphology";
import { elementNameKo, atomicOrder } from "../lib/elements";
import { elementColor, OTHER_COLOR } from "../lib/palette";
import { measureImage, type ShapeMeasurement, type SegmentParams, SHAPE_THRESHOLDS, DEFAULT_SEGMENT } from "../lib/image/measure";
import type { Basis, MorphologyClass, Particle } from "../lib/types";

const SOURCE_LABEL: Record<string, string> = {
  explicit: "파일에 명시",
  value_text: "값 칸 표기(ND·<LOD 등)",
  limit_compare: "한계값과 비교",
  inferred_value: "값에서 추정(>0 검출, 0 미검출)",
  absent_policy: "파일에 없음 → 설정 적용",
};

export function ParticleDetail({ particleKey }: { particleKey: string }) {
  const { particles, filtered, settings, rules, hazardRules, colorOrder, setOverride, data, updateMeta } = useStore();
  const p = particles.find((x) => x.key === particleKey);
  const [measure, setMeasure] = useState<ShapeMeasurement | null>(null);
  const [measureErr, setMeasureErr] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [params, setParams] = useState<SegmentParams>({ ...DEFAULT_SEGMENT });
  const [saved, setSaved] = useState(false);

  const idx = filtered.findIndex((x) => x.key === particleKey);
  const prev = idx > 0 ? filtered[idx - 1] : null;
  const next = idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1] : null;

  const derived = useMemo(() => {
    if (!p) return null;
    return {
      target: particleTargetResult(p, settings),
      type: classifyParticleType(p, settings, rules),
      source: sourceCandidates(p, settings, rules),
    };
  }, [p, settings, rules]);

  if (!p || !derived) {
    return (
      <div className="space-y-3">
        <a href={hrefFor({ page: "particles" })} className="text-accent text-[13px]">← 입자 목록</a>
        <Notice kind="warning">입자 “{particleKey}”를 찾을 수 없습니다. 데이터가 바뀌었을 수 있습니다.</Notice>
      </div>
    );
  }
  const m = p.meta;
  const override = data.overrides[p.key];
  const symbols = [...new Set([...Object.keys(p.elements), ...settings.targetElements])].sort((a, b) => atomicOrder(a) - atomicOrder(b));

  const runMeasure = async () => {
    if (!p.image) return;
    setMeasuring(true);
    setMeasureErr(null);
    try {
      setSaved(false);
      setMeasure(await measureImage(p.image.url, p.umPerPx, { ...params, cropBottomPx: params.cropBottomPx ?? p.image.instrument?.databarHeightPx ?? null }));
    } catch (e) {
      setMeasure(null);
      setMeasureErr((e as Error).message);
    } finally {
      setMeasuring(false);
    }
  };
  const setMorph = (v: MorphologyClass | null, method: string) => setOverride(p.key, { morphology: v, morphologyMethod: method });

  const checks: Array<{ ok: boolean; label: string; note?: string }> = [
    { ok: p.hasEds, label: "EDS 성분 데이터 있음" },
    { ok: p.edsValid, label: "유효 EDS 분석 입자", note: p.excludeReason ?? undefined },
    { ok: !p.flags.some((f) => f.code.startsWith("SUM_")), label: `조성 합계 100 ± ${settings.sumTolerance}%p 이내`, note: [p.wtSum != null ? `wt ${p.wtSum.toFixed(1)}%` : null, p.atSum != null ? `at ${p.atSum.toFixed(1)}%` : null].filter(Boolean).join(", ") || "정량값 없음" },
    { ok: Object.values(p.elements).some((e) => e.statusSource === "explicit"), label: "검출 상태가 파일에 명시됨" },
    { ok: Object.values(p.elements).some((e) => e.detection_limit != null), label: "검출한계 정보 있음" },
    { ok: p.normalized != null, label: "정규화 여부 기재", note: p.normalized == null ? "미기재" : p.normalized ? "정규화된 값" : "비정규화 원자료" },
    { ok: !!p.image, label: "SEM 이미지 연결", note: p.image ? `연결 방식: ${{ filename: "파일명 일치", basename: "확장자 제외 이름 일치", particle_id: "파일명 = 입자 ID", none: "" }[p.imageMatch]}` : m?.image_filename ? `${m.image_filename} 미업로드` : "파일명 미기재" },
    { ok: p.umPerPx != null, label: "스케일 보정 가능", note: p.umPerPx != null ? `${p.umPerPx.toPrecision(4)} µm/px (${m?.pixel_size_um != null ? "장비 메타데이터/직접 입력" : "스케일 바"})` : "픽셀 크기 또는 스케일 바 정보 누락" },
    { ok: !!p.morphology && !!p.classificationMethod, label: "형상 판정값과 판정 방법 기재" },
    { ok: settings.preparationChecked, label: "코팅·기판 신호 영향 확인(설정)" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3 no-print">
        <a href={hrefFor({ page: "particles" })} className="text-accent text-[13px] hover:underline">← 입자 목록</a>
        <span className="text-ink-3 text-[12.5px] tnum">{idx >= 0 ? `${idx + 1} / ${filtered.length} (필터 기준)` : "현재 필터 밖의 입자"}</span>
        <div className="ml-auto flex gap-2">
          <Button small disabled={!prev} onClick={() => prev && (window.location.hash = hrefFor({ page: "particles", particleKey: prev.key }))}>‹ 이전</Button>
          <Button small disabled={!next} onClick={() => next && (window.location.hash = hrefFor({ page: "particles", particleKey: next.key }))}>다음 ›</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-[22px] font-semibold">{p.sample_id} / {p.particle_id}</h1>
        {p.origin === "demo" && <DemoTag />}
        <TargetBadge status={derived.target.status} />
        <span className="text-[13px] text-ink-2">{p.date ?? "채취일 미기재"} · {p.location ?? "위치 미기재"}{m?.sample_type ? ` · ${m.sample_type}` : ""}</span>
        <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-2 no-print">
          <input type="checkbox" checked={!!override?.excluded} onChange={(e) => setOverride(p.key, { excluded: e.target.checked })} />
          이 입자를 분석에서 제외
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-4">
          {p.image ? (
            <ImageViewer image={p.image} height={480} overlay={measure ? measure.props.contour.map(([x, y]) => [x / measure.scale, y / measure.scale] as [number, number]) : null} />
          ) : (
            <div className="h-[300px] border border-dashed border-line-2 rounded-lg grid place-items-center text-center text-ink-2 text-[13px] bg-surface px-6">
              <div>
                <b className="text-ink">연결된 SEM 이미지가 없습니다</b>
                <div className="mt-1">{m?.image_filename ? <>메타데이터의 파일 “{m.image_filename}”을 데이터 업로드 화면에서 올리면 연결됩니다.</> : <>메타데이터에 image_filename을 적거나 이미지 파일명을 입자 ID({p.particle_id})와 같게 하세요.</>}</div>
              </div>
            </div>
          )}

          <Card title="SEM 촬영 정보와 크기" subtitle="장비 메타데이터·실측값만 표시하며 없는 값은 계산하지 않습니다">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-ink-3">장비</dt><dd>{m?.instrument ?? "미기재"}</dd>
              <dt className="text-ink-3">촬영 시각</dt><dd className="tnum">{m?.acquired_at ?? "미기재"}</dd>
              <dt className="text-ink-3">배율</dt><dd className="tnum">{m?.magnification ? `×${m.magnification.toLocaleString()}` : "미기재"}</dd>
              <dt className="text-ink-3">가속전압 · 검출기 · WD</dt><dd className="tnum">{[m?.accelerating_voltage_kv != null ? `${m.accelerating_voltage_kv} kV` : null, m?.detector, m?.working_distance_mm != null ? `WD ${fmtNum(m.working_distance_mm)} mm` : null].filter(Boolean).join(" · ") || "미기재"}</dd>
              <dt className="text-ink-3">픽셀 보정</dt><dd className="tnum">{p.umPerPx != null ? `${p.umPerPx.toPrecision(4)} µm/px${m?.pixel_size_um != null ? " (장비 메타데이터/직접 입력)" : " (스케일 바)"}` : <span className="text-ink-2">보정 정보 없음 → 실제 크기 계산 안 함</span>}</dd>
              {p.image?.width && p.umPerPx != null && (<><dt className="text-ink-3">시야 폭</dt><dd className="tnum">{fmtNum(p.image.width * p.umPerPx, 1)} µm</dd></>)}
              {m?.scale_bar_value != null && (<><dt className="text-ink-3">스케일 바</dt><dd className="tnum">{m.scale_bar_value} {m.scale_bar_unit ?? "(단위 없음)"}{m.scale_bar_px ? ` = ${m.scale_bar_px} px` : ""}</dd></>)}
              <dt className="text-ink-3">등가원 지름</dt><dd className="tnum">{m?.equivalent_diameter != null ? `${fmtNum(m.equivalent_diameter)} µm` : "측정값 없음"}</dd>
              <dt className="text-ink-3">최대 Feret 지름</dt><dd className="tnum">{m?.feret_diameter != null ? `${fmtNum(m.feret_diameter)} µm` : "측정값 없음"}</dd>
              <dt className="text-ink-3">투영 면적</dt><dd className="tnum">{m?.projected_area != null ? `${fmtNum(m.projected_area)} µm²` : "측정값 없음"}</dd>
              <dt className="text-ink-3">원형도 · 고형도 · 종횡비</dt><dd className="tnum">{m?.circularity != null ? `${fmtNum(m.circularity)} · ${fmtNum(m.solidity)} · ${fmtNum(m.aspect_ratio)}` : "측정값 없음"}</dd>
              {m?.size_method && (<><dt className="text-ink-3">크기 측정 방법</dt><dd className="text-[12px]">{m.size_method}</dd></>)}
              <dt className="text-ink-3">분석 조건</dt><dd>{m?.analysis_conditions ?? "미기재"}</dd>
              {m?.notes && (<><dt className="text-ink-3">비고</dt><dd>{m.notes}</dd></>)}
            </dl>
          </Card>

          <Card
            title="이미지 기반 형상 지표 측정"
            subtitle="정보바 제외 → 블러 → 임계값(Otsu × 계수) → 닫힘·구멍 채우기 → 가장 큰 영역. 윤곽을 확인한 경우에만 저장하며, 형상은 '후보'만 제안합니다."
          >
            {!p.image ? <p className="text-[13px] text-ink-2">이미지가 없어 측정할 수 없습니다.</p> : (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-2 no-print">
                  <Button onClick={runMeasure} disabled={measuring}>{measuring ? "측정 중…" : "형상 지표 측정"}</Button>
                  <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">임계 계수
                    <input type="range" min={0.4} max={1.2} step={0.05} value={params.thresholdFactor} onChange={(e) => setParams({ ...params, thresholdFactor: Number(e.target.value) })} />
                    <span className="tnum w-8">{params.thresholdFactor.toFixed(2)}</span></label>
                  <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2"><input type="checkbox" checked={!params.bright} onChange={(e) => setParams({ ...params, bright: !e.target.checked })} />입자가 배경보다 어두움</label>
                </div>
                {measureErr && <Notice kind="warning">{measureErr}</Notice>}
                {measure && (
                  <div className="space-y-2">
                    <table className="data text-[12.5px]">
                      <tbody>
                        <tr><td>등가원 지름</td><td className="num">{measure.eqdPx.toFixed(1)} px</td><td className="num">{measure.eqdUm != null ? `${measure.eqdUm.toFixed(2)} µm` : "보정 없음"}</td></tr>
                        <tr><td>투영 면적</td><td className="num">{measure.areaPx.toFixed(0)} px²</td><td className="num">{measure.areaUm2 != null ? `${measure.areaUm2.toFixed(2)} µm²` : "보정 없음"}</td></tr>
                        <tr><td>최대 Feret 지름</td><td className="num">{measure.feretPx.toFixed(1)} px</td><td className="num">{measure.feretUm != null ? `${measure.feretUm.toFixed(2)} µm` : "보정 없음"}</td></tr>
                        <tr><td>원형도 4πA/P²</td><td className="num" colSpan={2}>{measure.props.circ.toFixed(3)}</td></tr>
                        <tr><td>고형도 A/볼록껍질</td><td className="num" colSpan={2}>{measure.props.sol.toFixed(3)}</td></tr>
                        <tr><td>종횡비(장축/단축)</td><td className="num" colSpan={2}>{measure.props.ar.toFixed(2)}</td></tr>
                      </tbody>
                    </table>
                    <p className="text-[12px] text-ink-3">임계값 {Math.round(measure.threshold)} (Otsu {Math.round(measure.otsu)} × {measure.params.thresholdFactor}) · 하단 정보바 제외 {measure.cropBottom}px · 파란 윤곽이 측정 영역입니다. 윤곽이 입자와 다르면 임계 계수를 바꿔 다시 측정하고, 맞지 않으면 저장하지 마세요.{measure.touchesBorder && " ⚠ 측정 영역이 이미지 가장자리에 닿았습니다."}{p.image.synthetic && " DEMO 합성 이미지에서 측정한 값입니다."}</p>
                    {p.meta && (
                      <div className="no-print flex items-center gap-2">
                        <Button small variant="primary" disabled={saved} onClick={() => {
                          updateMeta(p.key, {
                            equivalent_diameter: measure.eqdUm, projected_area: measure.areaUm2, feret_diameter: measure.feretUm,
                            circularity: measure.props.circ, solidity: measure.props.sol, aspect_ratio: measure.props.ar, size_method: measure.methodLabel,
                          });
                          setSaved(true);
                        }}>{saved ? "저장됨" : "윤곽 확인 — 측정값을 입자 데이터에 저장"}</Button>
                        {measure.eqdUm == null && <span className="text-[12px] text-ink-3">픽셀 크기가 없어 µm 크기는 저장되지 않습니다.</span>}
                      </div>
                    )}
                    <div className="border border-line rounded-md p-2.5 text-[12.5px]">
                      <b>형상 후보:</b> {measure.candidate ? morphologyLabel(measure.candidate) : "제안 없음"} — {measure.candidateReason}
                      <div className="text-ink-3 mt-1">기준(합성 데이터 기본값, 재보정 필요): 종횡비 ≥ {SHAPE_THRESHOLDS.fibrousAspect} 섬유상 · 고형도 &lt; {SHAPE_THRESHOLDS.agglomerateSolidity} 응집체 · 원형도 ≥ {SHAPE_THRESHOLDS.sphericalCircularity} 및 종횡비 &lt; {SHAPE_THRESHOLDS.sphericalAspectMax} 구형</div>
                      {measure.candidate && (
                        <div className="mt-2 no-print">
                          <Button small variant="primary" onClick={() => setMorph(measure.candidate, "이미지 형상 지표 규칙(후보) → 사용자 확인")}>후보를 형상 판정값으로 적용</Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="관측 사실" subtitle="SEM 형상 판정과 EDS에서 검출된 원소 — 해석을 더하지 않은 값">
            <div className="text-[13px] space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-3 w-20">형상</span>
                <b>{morphologyLabel(p.morphology)}</b>
                <span className="text-[12px] text-ink-3">({p.morphologySource === "user" ? "대시보드에서 판정" : p.morphologySource === "metadata" ? "메타데이터" : "판정값 없음"}{p.classificationMethod ? ` · ${p.classificationMethod}` : ""})</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 no-print">
                <span className="text-ink-3 w-20">판정 수정</span>
                <select className="border border-line-2 rounded px-2 py-1 text-[12.5px]" value={override?.morphology !== undefined ? (override.morphology ?? "none") : "__meta"} onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__meta") setOverride(p.key, { morphology: undefined, morphologyMethod: undefined });
                  else setMorph(v === "none" ? null : (v as MorphologyClass), "사용자 판정(대시보드 입력)");
                }}>
                  <option value="__meta">메타데이터 값 사용{m?.morphology_class ? ` (${morphologyLabel(m.morphology_class)})` : ""}</option>
                  {MORPHOLOGY_CLASSES.map((c) => <option key={c} value={c}>{morphologyLabel(c)}</option>)}
                  <option value="none">미분류로 둠</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-ink-3 w-20">검출 원소</span>
                <span>{Object.values(p.elements).filter((e) => e.status === "detected").map((e) => e.symbol).join(", ") || "없음"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-ink-3 w-20">대상 원소</span>
                <span>{derived.target.detected.length ? derived.target.detected.join(", ") : "검출 없음"}{derived.target.missing.length > 0 && <span className="text-ink-3"> · 결측: {derived.target.missing.join(", ")}</span>}</span>
              </div>
            </div>
          </Card>

          <Card title="EDS 원소 조성표" subtitle={`출처: ${[...new Set(data.eds.filter((r) => `${r.sample_id}::${r.particle_id}` === p.key).map((r) => r.sourceFile))].join(", ") || "EDS 없음"} · 측정 방법: ${p.measurementMethod ?? "미기재"}`}>
            {!p.hasEds ? <p className="text-[13px] text-ink-2">이 입자의 EDS 데이터가 없습니다.</p> : (
              <div className="overflow-auto max-h-[380px]">
                <table className="data">
                  <thead><tr><th>원소</th><th>상태</th><th className="num">wt%</th><th className="num">at%</th><th className="num">LOD/LOQ</th><th>상태 근거</th></tr></thead>
                  <tbody>
                    {symbols.map((s) => {
                      const e = p.elements[s];
                      const st = elementStatus(p, s, settings);
                      const isT = settings.targetElements.includes(s);
                      if (!e && !isT) return null;
                      return (
                        <tr key={s} className={e ? "" : "text-ink-3"}>
                          <td><b>{s}</b> <span className="text-[11.5px] text-ink-3">{elementNameKo(s)}</span>{isT && <span className="ml-1 text-[10.5px] border border-line-2 rounded px-1 text-ink-2">대상</span>}</td>
                          <td><StatusBadge status={st.status} /></td>
                          <td className="num">{e?.wt != null ? e.wt.toFixed(2) : "—"}</td>
                          <td className="num">{e?.at != null ? e.at.toFixed(2) : "—"}</td>
                          <td className="num">{e?.detection_limit ?? "—"}/{e?.quantification_limit ?? "—"}</td>
                          <td className="text-[11.5px] text-ink-3">{SOURCE_LABEL[st.source]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={2} className="text-[12px] text-ink-2">합계(기재된 값)</td><td className="num">{p.wtSum?.toFixed(2) ?? "—"}</td><td className="num">{p.atSum?.toFixed(2) ?? "—"}</td><td colSpan={2} className="text-[11.5px] text-ink-3">{p.normalized == null ? "정규화 여부 미기재" : p.normalized ? "정규화된 값" : "비정규화 원자료"}</td></tr>
                  </tfoot>
                </table>
              </div>
            )}
            {p.hasEds && (
              <div className="mt-3 space-y-2">
                {(["wt", "at"] as Basis[]).map((b) => <CompositionBar key={b} p={p} basis={b} order={colorOrder} />)}
              </div>
            )}
          </Card>

          <Card title="해석 가설: 입자 유형과 발생원 후보" subtitle={`분류 방식: ${derived.type.method} · 확정이 아닌 후보`}>
            <div className="text-[13px] mb-3">
              <span className="text-ink-3">입자 유형 후보</span> <b className="ml-1">{derived.type.label}</b>
              <ul className="text-[12px] text-ink-2 mt-1 list-disc pl-5">{derived.type.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
            <div className="text-[13px] font-medium mb-1.5">발생원 후보 — {derived.source.summaryLabel}</div>
            {derived.source.matches.length === 0 && <p className="text-[12.5px] text-ink-2 mb-2">규칙과 일치하는 발생원 후보가 없습니다(발생원 판별 불가). 다른 기원의 가능성을 배제한다는 뜻이 아닙니다.</p>}
            <div className="space-y-2">
              {derived.source.matches.map((mt) => (
                <div key={mt.ruleId} className="border border-line rounded-md p-3 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2"><b className="text-[13px]">{mt.candidate}</b><span className="text-[11.5px] border border-line-2 rounded px-1.5 py-px">판단 수준: {mt.level}</span></div>
                  <dl className="mt-1.5 space-y-1">
                    <div><dt className="inline text-ink-3">판단에 활용한 특징 · </dt><dd className="inline">{mt.features}</dd></div>
                    <div><dt className="text-ink-3">실제 데이터에서 확인된 근거</dt><dd><ul className="list-disc pl-5">{mt.evidence.map((e, i) => <li key={i}>{e}</li>)}{mt.supportingEvidence.map((e, i) => <li key={"s" + i}>보조: {e}</li>)}</ul></dd></div>
                    {mt.missingSupport.length > 0 && <div><dt className="text-ink-3">확인되지 않은 보조 근거</dt><dd><ul className="list-disc pl-5 text-ink-2">{mt.missingSupport.map((e, i) => <li key={i}>{e}</li>)}</ul></dd></div>}
                    <div><dt className="inline text-ink-3">대안적 설명 · </dt><dd className="inline">{mt.alternatives.join(", ") || "—"}</dd></div>
                    <div><dt className="inline text-ink-3">추가로 필요한 검증 데이터 · </dt><dd className="inline">{mt.requiredValidation.join(", ") || "—"}</dd></div>
                    <div className="text-ink-3">임계값 근거: {mt.thresholdBasis}</div>
                  </dl>
                </div>
              ))}
              {derived.source.notEvaluable.map((n) => (
                <div key={n.candidate} className="border border-dashed border-line-2 rounded-md p-2.5 text-[12.5px] text-ink-2">
                  <b className="text-ink">{n.candidate}</b> — 판별 불가: {n.reason}. 필요: {n.requiredValidation.join(", ")}
                </div>
              ))}
            </div>
          </Card>

          <Card title="확인되지 않은 사항과 데이터 품질" subtitle="점검 항목은 데이터 상태를 그대로 보여주며 임의의 신뢰도 점수를 만들지 않습니다">
            <ul className="text-[12.5px] space-y-1 mb-3">
              {checks.map((c) => (
                <li key={c.label} className="flex gap-2">
                  <span aria-hidden className={c.ok ? "text-[#0a7d0a]" : "text-[#a42f2f]"}>{c.ok ? "✓" : "✕"}</span>
                  <span className={c.ok ? "" : "font-medium"}>{c.label}<span className="sr-only">{c.ok ? " 충족" : " 미충족"}</span></span>
                  {c.note && <span className="text-ink-3">— {c.note}</span>}
                </li>
              ))}
            </ul>
            {p.flags.length > 0 && (
              <ul className="space-y-1.5">
                {p.flags.map((f, i) => <li key={i} className="flex items-start gap-2 text-[12.5px]"><LevelBadge level={f.level} /><span>{f.message}</span></li>)}
              </ul>
            )}
            <ul className="text-[12px] text-ink-3 mt-3 list-disc pl-5 space-y-0.5">
              <li>원소의 화학종(산화수·화합물 형태)은 EDS로 확인되지 않았습니다.</li>
              <li>대상 원소 검출은 이 입자의 독성이나 인체 위해도를 뜻하지 않습니다.</li>
              {hazardRules.length > 0 && derived.target.detected.some((s) => hazardRules.find((r) => r.element_symbol === s && r.reference_name)) && (
                <li>검출된 대상 원소의 평가 범주(참고): {derived.target.detected.map((s) => `${s} — ${hazardRules.find((r) => r.element_symbol === s)?.assessment_category ?? "규칙 없음"}`).join(" / ")}</li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CompositionBar({ p, basis, order }: { p: Particle; basis: Basis; order: string[] }) {
  const top = topElements(p, basis, 5);
  const all = topElements(p, basis, 99);
  const total = all.reduce((a, b) => a + b.value, 0);
  const label = basis === "wt" ? "wt%(중량%)" : "at%(원자%)";
  if (!all.length) return <div className="text-[12px] text-ink-3">{label}: 정량값 없음(환산해 만들지 않음)</div>;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-ink-2 mb-1"><span>{label} 조성 · TOP 5: {top.map((t) => `${t.symbol} ${t.value.toFixed(1)}`).join(", ")}</span><span className="tnum text-ink-3">합 {total.toFixed(1)}</span></div>
      <div className="flex h-4 rounded overflow-hidden border border-line" role="img" aria-label={`${label} 조성 막대`}>
        {all.map((e) => (
          <div key={e.symbol} title={`${e.symbol} ${e.value.toFixed(2)} ${basis}%`} style={{ width: `${(e.value / Math.max(total, 100)) * 100}%`, background: order.includes(e.symbol) ? elementColor(e.symbol, order) : OTHER_COLOR, borderRight: "2px solid #fff" }} />
        ))}
      </div>
    </div>
  );
}
