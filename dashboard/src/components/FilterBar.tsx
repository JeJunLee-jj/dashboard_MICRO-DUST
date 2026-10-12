/* 대시보드 공통 필터: 날짜, 시료 ID, 채취 위치, 형상, 원소, 위해성 평가 대상 여부 */
import { useMemo, useRef, useState, useEffect } from "react";
import { useStore } from "../state/store";
import { activeFilterCount, filterOptions } from "../lib/filters";
import { morphologyLabel } from "../lib/morphology";
import { EMPTY_FILTERS, type Filters } from "../lib/types";

function MultiSelect({ label, options, value, onChange, render = (x) => x }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; render?: (x: string) => string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);
  const summary = value.length === 0 ? "전체" : value.length === 1 ? render(value[0]) : `${value.length}개 선택`;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 border rounded-[3px] px-2.5 py-1 text-[13.5px] bg-surface hover:bg-surface-2 ${value.length ? "border-accent text-accent font-medium" : "border-line-2 text-ink-2"}`} aria-expanded={open}>
        <span className="text-ink-3 font-normal">{label}</span>
        <span className="max-w-[150px] truncate">{summary}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-[220px] max-h-[300px] overflow-auto bg-surface border border-line-2 rounded-[3px] shadow-lg py-1">
          {options.length === 0 && <div className="px-3 py-2 text-[13.5px] text-ink-3">선택할 값이 없습니다</div>}
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-[13.5px] hover:bg-surface-2 cursor-pointer">
              <input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
              <span>{render(o)}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button className="w-full text-left px-3 py-1.5 text-[13px] text-accent border-t border-line mt-1" onClick={() => onChange([])}>
              선택 해제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterBar() {
  const { particles, filtered, filters, setFilters } = useStore();
  const opt = useMemo(() => filterOptions(particles), [particles]);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const n = activeFilterCount(filters);
  if (!particles.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 bg-surface border border-line rounded-[3px] px-3 py-2 mb-4 no-print">
      <span className="text-[13.5px] font-semibold text-ink-2 mr-1">필터</span>
      <label className="flex items-center gap-1 text-[13.5px] text-ink-3">
        날짜
        <input type="date" className="border border-line-2 rounded px-1.5 py-0.5 text-[13.5px] text-ink" value={filters.dateFrom ?? ""} min={opt.dateMin ?? undefined} max={opt.dateMax ?? undefined} onChange={(e) => set({ dateFrom: e.target.value || null })} aria-label="시작 날짜" />
        ~
        <input type="date" className="border border-line-2 rounded px-1.5 py-0.5 text-[13.5px] text-ink" value={filters.dateTo ?? ""} min={opt.dateMin ?? undefined} max={opt.dateMax ?? undefined} onChange={(e) => set({ dateTo: e.target.value || null })} aria-label="종료 날짜" />
      </label>
      <MultiSelect label="시료" options={opt.samples} value={filters.samples} onChange={(v) => set({ samples: v })} />
      <MultiSelect label="위치" options={opt.locations} value={filters.locations} onChange={(v) => set({ locations: v })} />
      <MultiSelect label="형상" options={opt.morphologies} value={filters.morphologies} onChange={(v) => set({ morphologies: v })} render={morphologyLabel} />
      <label className="flex items-center gap-1 text-[13.5px] text-ink-3">
        원소 검출
        <select className={`border rounded px-1.5 py-1 text-[13.5px] bg-surface ${filters.element ? "border-accent text-accent" : "border-line-2 text-ink"}`} value={filters.element ?? ""} onChange={(e) => set({ element: e.target.value || null })}>
          <option value="">전체</option>
          {opt.elements.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 text-[13.5px] text-ink-3">
        대상 원소
        <select className={`border rounded px-1.5 py-1 text-[13.5px] bg-surface ${filters.targetStatus !== "all" ? "border-accent text-accent" : "border-line-2 text-ink"}`} value={filters.targetStatus} onChange={(e) => set({ targetStatus: e.target.value as Filters["targetStatus"] })}>
          <option value="all">전체</option>
          <option value="positive">1개 이상 검출</option>
          <option value="negative">미검출</option>
          <option value="undetermined">판정 불가(결측)</option>
        </select>
      </label>
      <span className="ml-auto text-[13.5px] text-ink-2 tnum">
        표시 <b className="text-ink">{filtered.length}</b> / 전체 {particles.length} 입자
      </span>
      {n > 0 && (
        <button className="text-[13.5px] text-accent font-medium hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>
          필터 초기화({n})
        </button>
      )}
    </div>
  );
}
