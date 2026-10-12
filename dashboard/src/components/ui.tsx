/* 공통 UI 조각 */
import { useState, type ReactNode } from "react";
import type { DetectionStatus, IssueLevel } from "../lib/types";
import { STATUS_LABEL } from "../lib/exports";
import { STATUS_COLOR } from "../lib/palette";

export function Card({ title, subtitle, actions, children, className = "", id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`bg-surface border border-line rounded-lg ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold text-ink leading-snug">{title}</h3>}
            {subtitle && <p className="text-[12.5px] text-ink-3 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0 no-print">{actions}</div>}
        </header>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-ink-2 text-[13.5px] mt-1 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, unit, detail, demo, onClick }: { label: string; value: ReactNode; unit?: string; detail?: ReactNode; demo?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`text-left bg-surface border border-line rounded-lg px-4 py-3 relative ${onClick ? "hover:border-accent cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-2 font-medium">{label}</span>
        {demo && <DemoTag small />}
      </div>
      <div className="text-[28px] font-semibold leading-tight mt-1 tnum">
        {value}
        {unit && <small className="text-[14px] font-medium text-ink-3 ml-1">{unit}</small>}
      </div>
      {detail && <div className="text-[12px] text-ink-3 mt-1 leading-snug">{detail}</div>}
    </Tag>
  );
}

export function DemoTag({ small }: { small?: boolean }) {
  return (
    <span className={`demo-stripes border border-[#e2b65a] text-demo font-semibold rounded ${small ? "text-[10.5px] px-1.5 py-px" : "text-[12px] px-2 py-0.5"}`} title="가상 예시 데이터 — 실제 측정 결과가 아닙니다">
      DEMO·가상
    </span>
  );
}

export function Button({ children, onClick, variant = "default", disabled, title, type = "button", small }: { children: ReactNode; onClick?: () => void; variant?: "default" | "primary" | "ghost" | "danger"; disabled?: boolean; title?: string; type?: "button" | "submit"; small?: boolean }) {
  const styles = {
    default: "bg-surface border-line-2 text-ink hover:bg-surface-2",
    primary: "bg-accent border-accent text-white hover:bg-accent-2",
    ghost: "bg-transparent border-transparent text-ink-2 hover:bg-surface-2",
    danger: "bg-surface border-[#e3b4b4] text-[#a42f2f] hover:bg-[#fbeeee]",
  }[variant];
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`inline-flex items-center gap-1.5 border rounded-md font-medium ${small ? "text-[12px] px-2 py-1" : "text-[13px] px-3 py-1.5"} disabled:opacity-50 disabled:cursor-not-allowed ${styles}`}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      {label && <span className="text-[12.5px] text-ink-2">{label}</span>}
      <div className="inline-flex border border-line-2 rounded-md overflow-hidden" role="radiogroup">
        {options.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={`px-2.5 py-1 text-[12.5px] font-medium ${value === o.value ? "bg-accent text-white" : "bg-surface text-ink-2 hover:bg-surface-2"}`}>
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
    <div className="border border-line rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
      <span className="font-semibold text-ink mr-1.5">{title}</span>
      {children}
    </div>
  );
}

export function Notice({ kind = "info", title, children }: { kind?: "info" | "warning" | "caution"; title?: string; children: ReactNode }) {
  const s = {
    info: "border-[#b9d8d2] bg-accent-soft text-[#163f3a]",
    warning: "border-[#f0d08a] bg-[#fff8e6] text-[#5c4300]",
    caution: "border-[#e8c3b3] bg-[#fdf2ec] text-[#5a2c17]",
  }[kind];
  const icon = { info: "ⓘ", warning: "⚠", caution: "!" }[kind];
  return (
    <div className={`border rounded-md px-3.5 py-2.5 text-[13px] leading-relaxed ${s}`} role={kind === "info" ? "note" : "alert"}>
      <span aria-hidden className="font-bold mr-1.5">{icon}</span>
      {title && <b className="mr-1">{title}</b>}
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-line-2 rounded-lg bg-surface px-6 py-10 text-center">
      <div className="text-[15px] font-semibold">{title}</div>
      {children && <div className="text-ink-2 text-[13px] mt-1.5 max-w-xl mx-auto">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function NotAvailable({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-2 bg-surface-2 border border-line rounded-md px-3 py-6 justify-center">
      <span className="font-semibold text-ink">분석 불가</span>
      <span>— {children}</span>
    </div>
  );
}

const LEVEL_STYLE: Record<IssueLevel, { label: string; icon: string; cls: string }> = {
  error: { label: "오류", icon: "✕", cls: "text-[#a42f2f] bg-[#fbeeee] border-[#efc4c4]" },
  warning: { label: "경고", icon: "⚠", cls: "text-[#6b4b00] bg-[#fff6dc] border-[#f1d68f]" },
  info: { label: "안내", icon: "ⓘ", cls: "text-[#24504a] bg-accent-soft border-[#bcdcd5]" },
};
export function LevelBadge({ level }: { level: IssueLevel }) {
  const s = LEVEL_STYLE[level];
  return (
    <span className={`inline-flex items-center gap-1 border rounded px-1.5 py-px text-[11.5px] font-semibold whitespace-nowrap ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: DetectionStatus }) {
  const icon = { detected: "●", below_loq: "◐", below_lod: "○", not_detected: "–", missing: "?" }[status];
  return (
    <span className="inline-flex items-center gap-1 text-[12px] whitespace-nowrap">
      <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm border border-line-2" style={{ background: STATUS_COLOR[status] }} />
      <span aria-hidden className="text-ink-3">{icon}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TargetBadge({ status }: { status: "positive" | "negative" | "undetermined" | "invalid" }) {
  const m = {
    positive: { t: "대상 원소 검출", c: "border-[#9cc0ec] bg-[#eef5fd] text-[#174a88]", i: "●" },
    negative: { t: "대상 원소 미검출", c: "border-line-2 bg-surface-2 text-ink-2", i: "○" },
    undetermined: { t: "판정 불가(결측)", c: "border-[#f1d68f] bg-[#fff6dc] text-[#6b4b00]", i: "?" },
    invalid: { t: "분석 제외", c: "border-line bg-surface-2 text-ink-3", i: "–" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 border rounded px-1.5 py-px text-[11.5px] font-semibold whitespace-nowrap ${m.c}`}>
      <span aria-hidden>{m.i}</span>
      {m.t}
    </span>
  );
}

export function Pct({ k, n, digits = 1 }: { k: number; n: number; digits?: number }) {
  if (!n) return <span className="text-ink-3">—</span>;
  return (
    <span className="tnum">
      {((k / n) * 100).toFixed(digits)}%<span className="text-ink-3 text-[11.5px] ml-1">({k}/{n})</span>
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
    <div className="border border-line rounded-md">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium text-left hover:bg-surface-2" aria-expanded={open}>
        <span>{title}</span>
        <span aria-hidden className="text-ink-3">{open ? "▴" : "▾"}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string; pattern?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm border border-black/10" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
