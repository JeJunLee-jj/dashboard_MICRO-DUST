/* 공통 UI 조각 */
import { useState, type ReactNode } from "react";
import type { DetectionStatus, IssueLevel } from "../lib/types";
import { STATUS_LABEL } from "../lib/exports";
import { STATUS_COLOR } from "../lib/palette";
import { useStore } from "../state/store";

/** 페이지 번호·영문 표제(도면 표제란처럼 작게) */
const PAGE_EYEBROW: Record<string, string> = {
  simulator: "01 — Site Criteria Simulator",
  overview: "02 — Overview",
  particles: "03 — SEM Particles",
  eds: "04 — EDS Composition",
  integration: "05 — Morphology × Composition",
  hazard: "06 — Hazard Elements",
  samples: "07 — Samples & Sites",
  data: "08 — Data & Quality",
  settings: "09 — Settings & Export",
};

export function Card({ title, subtitle, actions, children, className = "", id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`bg-surface border border-line rounded-[3px] ${className}`}>
      {(title || actions) && (
        <header className="px-5 pt-4 pb-3 border-b border-line">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            {title && (
              <h3 className="text-[16.5px] font-semibold text-ink leading-snug flex items-start gap-2 min-w-0">
                <span aria-hidden className="inline-block w-2 h-2 bg-signal shrink-0 mt-[0.55em]" />
                <span>{title}</span>
              </h3>
            )}
            {actions && <div className="flex flex-wrap items-center gap-1.5 shrink-0 no-print ml-auto">{actions}</div>}
          </div>
          {subtitle && <p className="text-[14px] text-ink-2 mt-1.5 leading-relaxed">{subtitle}</p>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  const { route } = useStore();
  return (
    <div className="blueprint border border-line rounded-[3px] bg-surface/60 px-6 pt-5 pb-5 mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="eyebrow mb-2">{PAGE_EYEBROW[route.page] ?? ""}</div>
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="text-ink-2 text-[15px] mt-2 max-w-3xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, unit, detail, demo, onClick }: { label: string; value: ReactNode; unit?: string; detail?: ReactNode; demo?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`group text-left bg-surface border border-line rounded-[3px] px-5 pt-4 pb-4 relative ${onClick ? "hover:border-ink cursor-pointer" : ""}`}>
      <span aria-hidden className="absolute right-0 bottom-0 w-0 h-0 border-l-[10px] border-l-transparent border-b-[10px] border-b-line-2 group-hover:border-b-signal" />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] text-ink-2 font-semibold leading-snug">{label}</span>
        {demo && <DemoTag small />}
      </div>
      <div className="text-[clamp(26px,2.3vw,34px)] font-bold leading-none mt-3 tnum tracking-[-0.02em] text-ink whitespace-nowrap">
        {value}
        {unit && <small className="text-[15px] font-semibold text-ink-2 ml-1 tracking-normal">{unit}</small>}
      </div>
      {detail && <div className="text-[13.5px] text-ink-2 mt-2.5 leading-snug">{detail}</div>}
    </Tag>
  );
}

export function DemoTag({ small }: { small?: boolean }) {
  return (
    <span className={`demo-stripes border border-[#d9a441] text-demo font-semibold rounded-[2px] whitespace-nowrap ${small ? "text-[12px] px-1.5 py-px" : "text-[13px] px-2 py-0.5"}`} title="가상 예시 데이터 — 실제 측정 결과가 아닙니다">
      DEMO·가상
    </span>
  );
}

export function Button({ children, onClick, variant = "default", disabled, title, type = "button", small }: { children: ReactNode; onClick?: () => void; variant?: "default" | "primary" | "ghost" | "danger"; disabled?: boolean; title?: string; type?: "button" | "submit"; small?: boolean }) {
  const styles = {
    default: "bg-surface border-line-2 text-ink hover:border-ink hover:bg-surface-2",
    primary: "bg-block border-block text-white hover:bg-[#3d3b37]",
    ghost: "bg-transparent border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
    danger: "bg-surface border-[#d9a3a3] text-[#9c2b2b] hover:bg-[#fbeeee]",
  }[variant];
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`inline-flex items-center gap-1.5 border rounded-[3px] font-semibold ${small ? "text-[13px] px-2.5 py-1" : "text-[14px] px-3.5 py-2"} disabled:opacity-45 disabled:cursor-not-allowed ${styles}`}>
      {children}
      {variant === "primary" && <span aria-hidden className="text-signal ml-0.5">→</span>}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      {label && <span className="text-[14px] text-ink-2 font-medium">{label}</span>}
      <div className="inline-flex border border-line-2 rounded-[3px] overflow-hidden" role="radiogroup">
        {options.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={`px-3 py-1 text-[13.5px] font-semibold border-r border-line last:border-r-0 ${value === o.value ? "bg-block text-white" : "bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 계산식과 분모를 함께 보여주는 상자 */
export function Formula({ children, title = "계산식" }: { children: ReactNode; title?: string }) {
  return (
    <div className="border border-line border-l-[3px] border-l-block rounded-[2px] bg-surface px-4 py-2.5 text-[14px] text-ink-2 leading-relaxed">
      <span className="font-mono text-[12px] font-semibold tracking-[0.06em] uppercase text-accent mr-2">{title}</span>
      {children}
    </div>
  );
}

export function Notice({ kind = "info", title, children }: { kind?: "info" | "warning" | "caution"; title?: string; children: ReactNode }) {
  const s = {
    info: "border-l-block bg-surface text-ink",
    warning: "border-l-[#d99a00] bg-[#fff7e0] text-[#3f2f00]",
    caution: "border-l-signal bg-accent-soft text-[#4a1d0d]",
  }[kind];
  const icon = { info: "ⓘ", warning: "⚠", caution: "!" }[kind];
  return (
    <div className={`border border-line border-l-[3px] rounded-[2px] px-4 py-3 text-[14.5px] leading-relaxed ${s}`} role={kind === "info" ? "note" : "alert"}>
      <span aria-hidden className="font-bold mr-1.5">{icon}</span>
      {title && <b className="mr-1">{title}</b>}
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="blueprint border border-line rounded-[3px] bg-surface/60 px-6 py-14 text-center">
      <div className="eyebrow mb-2">No data</div>
      <div className="text-[19px] font-bold">{title}</div>
      {children && <div className="text-ink-2 text-[15px] mt-2 max-w-xl mx-auto leading-relaxed">{children}</div>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function NotAvailable({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[14.5px] text-ink-2 bg-surface-2 border border-dashed border-line-2 rounded-[2px] px-3 py-6 justify-center">
      <span className="font-semibold text-ink">분석 불가</span>
      <span>— {children}</span>
    </div>
  );
}

const LEVEL_STYLE: Record<IssueLevel, { label: string; icon: string; cls: string }> = {
  error: { label: "오류", icon: "✕", cls: "text-[#a42f2f] bg-[#fbeeee] border-[#efc4c4]" },
  warning: { label: "경고", icon: "⚠", cls: "text-[#6b4b00] bg-[#fff6dc] border-[#f1d68f]" },
  info: { label: "안내", icon: "ⓘ", cls: "text-ink-2 bg-surface-2 border-line-2" },
};
export function LevelBadge({ level }: { level: IssueLevel }) {
  const s = LEVEL_STYLE[level];
  return (
    <span className={`inline-flex items-center gap-1 border rounded-[2px] px-1.5 py-px text-[12.5px] font-semibold whitespace-nowrap ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: DetectionStatus }) {
  const icon = { detected: "●", below_loq: "◐", below_lod: "○", not_detected: "–", missing: "?" }[status];
  return (
    <span className="inline-flex items-center gap-1 text-[13px] whitespace-nowrap">
      <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm border border-line-2" style={{ background: STATUS_COLOR[status] }} />
      <span aria-hidden className="text-ink-3">{icon}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TargetBadge({ status }: { status: "positive" | "negative" | "undetermined" | "invalid" }) {
  const m = {
    positive: { t: "대상 원소 검출", c: "border-[#e2a58f] bg-accent-soft text-accent", i: "●" },
    negative: { t: "대상 원소 미검출", c: "border-line-2 bg-surface-2 text-ink-2", i: "○" },
    undetermined: { t: "판정 불가(결측)", c: "border-[#f1d68f] bg-[#fff6dc] text-[#6b4b00]", i: "?" },
    invalid: { t: "분석 제외", c: "border-line bg-surface-2 text-ink-3", i: "–" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 border rounded-[2px] px-1.5 py-px text-[12.5px] font-semibold whitespace-nowrap ${m.c}`}>
      <span aria-hidden>{m.i}</span>
      {m.t}
    </span>
  );
}

export function Pct({ k, n, digits = 1 }: { k: number; n: number; digits?: number }) {
  if (!n) return <span className="text-ink-3">—</span>;
  return (
    <span className="tnum">
      {((k / n) * 100).toFixed(digits)}%<span className="text-ink-3 text-[12.5px] ml-1">({k}/{n})</span>
    </span>
  );
}

export function fmtNum(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-line rounded-[3px]">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-[14px] font-medium text-left hover:bg-surface-2" aria-expanded={open}>
        <span>{title}</span>
        <span aria-hidden className="text-ink-3">{open ? "▴" : "▾"}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string; pattern?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-black/15" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
