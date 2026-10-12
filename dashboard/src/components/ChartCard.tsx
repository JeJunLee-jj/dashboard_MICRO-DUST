/* 차트 카드: 제목·기준(wt%/at%)·분모·출처 표시, PNG 저장, 표 보기 */
import { useRef, useState, type ReactNode } from "react";
import { Card, DemoTag } from "./ui";
import { useStore } from "../state/store";

async function svgToPng(container: HTMLElement, title: string, subtitle: string, demo: boolean): Promise<Blob | null> {
  const svgs = [...container.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().width > 60);
  const svg = svgs.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  clone.querySelectorAll("text").forEach((t) => {
    t.setAttribute("font-family", "IBM Plex Sans KR, Malgun Gothic, sans-serif");
    if (!t.getAttribute("font-size")) t.setAttribute("font-size", "12");
  });
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("svg"));
    img.src = url;
  });
  const scale = 2, header = demo ? 74 : 54, pad = 16;
  const c = document.createElement("canvas");
  c.width = (rect.width + pad * 2) * scale;
  c.height = (rect.height + header + pad) * scale;
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#282828";
  ctx.font = "600 15px 'IBM Plex Sans KR', 'Malgun Gothic', sans-serif";
  ctx.fillText(title, pad, 24);
  ctx.fillStyle = "#4a4945";
  ctx.font = "12px 'IBM Plex Sans KR', 'Malgun Gothic', sans-serif";
  ctx.fillText(subtitle.slice(0, 160), pad, 43);
  if (demo) {
    ctx.fillStyle = "#8a5a00";
    ctx.font = "600 12px 'IBM Plex Sans KR', 'Malgun Gothic', sans-serif";
    ctx.fillText("DEMO·가상 데이터 — 실제 측정 결과 아님", pad, 62);
  }
  ctx.drawImage(img, pad, header, rect.width, rect.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

export function ChartCard({ title, subtitle, children, table, actions, className = "", fileName }: {
  title: string;
  subtitle: string;
  children: ReactNode;
  table?: ReactNode;
  actions?: ReactNode;
  className?: string;
  fileName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showTable, setShowTable] = useState(false);
  const { origin } = useStore();
  const demo = origin === "demo";

  const save = async () => {
    if (!ref.current) return;
    const blob = await svgToPng(ref.current, title, subtitle, demo);
    if (!blob) {
      alert("저장할 그래프가 없습니다(표 보기 상태이거나 데이터가 없습니다).");
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName ?? title.replace(/[^\w가-힣]+/g, "_")}${demo ? "_DEMO" : ""}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <Card
      className={className}
      title={<span className="inline-flex items-center gap-2">{title}{demo && <DemoTag small />}</span>}
      subtitle={subtitle}
      actions={
        <>
          {actions}
          {table && (
            <button className="text-[13px] text-ink-2 hover:text-ink px-1.5 py-0.5 rounded hover:bg-surface-2" onClick={() => setShowTable(!showTable)} aria-pressed={showTable}>
              {showTable ? "그래프" : "표"}
            </button>
          )}
          <button className="text-[13px] text-ink-2 hover:text-ink px-1.5 py-0.5 rounded hover:bg-surface-2" onClick={save} title="그래프를 PNG로 저장">
            PNG
          </button>
        </>
      }
    >
      <div ref={ref}>{showTable && table ? <div className="max-h-[360px] overflow-auto">{table}</div> : children}</div>
    </Card>
  );
}
