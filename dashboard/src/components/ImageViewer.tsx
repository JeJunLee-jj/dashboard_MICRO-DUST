/* 확대·축소·이동이 되는 SEM 이미지 뷰어. 휠 = 확대/축소, 드래그 = 이동, 더블클릭 = 맞춤 */
import { useEffect, useRef, useState } from "react";
import type { ImageAsset } from "../lib/types";
import { DemoTag } from "./ui";

export function ImageViewer({ image, height = 460, overlay }: { image: ImageAsset; height?: number; overlay?: Array<[number, number]> | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [fit, setFit] = useState(1);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [loaded, setLoaded] = useState<"loading" | "ok" | "error">("loading");

  const reset = () => {
    const el = box.current;
    if (!el || !image.width || !image.height) return;
    const f = Math.min(el.clientWidth / image.width, height / image.height);
    setFit(f);
    setZ(1);
    setPos({ x: (el.clientWidth - image.width * f) / 2, y: (height - image.height * f) / 2 });
  };
  useEffect(() => {
    setLoaded("loading");
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.url]);

  const live = useRef({ z, pos });
  live.current = { z, pos };
  const zoomAt = (mx: number, my: number, k: number) => {
    const { z: z0, pos: p } = live.current;
    const z1 = Math.min(20, Math.max(0.5, z0 * k));
    setPos({ x: mx - ((mx - p.x) * z1) / z0, y: my - ((my - p.y) * z1) / z0 });
    setZ(z1);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scale = fit * z;
  const zoomBy = (k: number) => zoomAt(box.current!.clientWidth / 2, height / 2, k);

  return (
    <div className="border border-line rounded-lg overflow-hidden bg-[#1b1f1e]">
      <div
        ref={box}
        className="relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
        style={{ height }}
        onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y })}
        onMouseMove={(e) => {
          if (!drag.current) return;
          setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        onDoubleClick={reset}
      >
        <img
          src={image.url}
          alt={`SEM 이미지 ${image.filename}`}
          draggable={false}
          onLoad={() => {
            setLoaded("ok");
            reset();
          }}
          onError={() => setLoaded("error")}
          style={{ position: "absolute", left: pos.x, top: pos.y, width: (image.width ?? 0) * scale, height: (image.height ?? 0) * scale, maxWidth: "none", imageRendering: z > 3 ? "pixelated" : "auto" }}
        />
        {overlay && overlay.length > 2 && image.width && image.height && (
          <svg className="absolute pointer-events-none" style={{ left: pos.x, top: pos.y }} width={image.width * scale} height={image.height * scale} viewBox={`0 0 ${image.width} ${image.height}`}>
            <polygon points={overlay.map(([x, y]) => `${x},${y}`).join(" ")} fill="rgba(42,120,214,0.12)" stroke="#5fb0ff" strokeWidth={2 / scale} />
          </svg>
        )}
        {loaded === "error" && <div className="absolute inset-0 grid place-items-center text-white/80 text-sm">이미지를 표시할 수 없습니다.</div>}
        {image.synthetic && (
          <div className="absolute left-2 top-2">
            <DemoTag />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface border-t border-line px-3 py-1.5 text-[12px] text-ink-2">
        <span className="truncate">
          <span className="font-mono">{image.filename}</span>
          {image.width && <span className="ml-2 text-ink-3">{image.width}×{image.height}px</span>}
          {image.note && <span className="ml-2 text-demo">· {image.note}</span>}
        </span>
        <span className="flex items-center gap-1 no-print">
          <button className="px-2 py-0.5 rounded hover:bg-surface-2" onClick={() => zoomBy(1 / 1.4)} aria-label="축소">−</button>
          <span className="tnum w-12 text-center">{Math.round(scale * 100)}%</span>
          <button className="px-2 py-0.5 rounded hover:bg-surface-2" onClick={() => zoomBy(1.4)} aria-label="확대">＋</button>
          <button className="px-2 py-0.5 rounded hover:bg-surface-2" onClick={reset}>맞춤</button>
          <a className="px-2 py-0.5 rounded hover:bg-surface-2" href={image.url} target="_blank" rel="noreferrer">원본</a>
        </span>
      </div>
    </div>
  );
}
