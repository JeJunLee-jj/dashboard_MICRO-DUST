/* DEMO 모드용 합성 SEM 이미지. 실제 현미경 사진이 아니며 화면 흐름을 보여주기 위한 그림이다.
   이미지마다 "DEMO 합성 이미지" 워터마크와 정보바를 넣어 실제 이미지와 혼동하지 않게 한다. */
import type { ImageAsset, MorphologyClass, ParticleMeta } from "../types";
import { micronsPerPixel } from "../parse/metadata";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 640, H = 480, BAR = 44;

function polygon(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function drawParticle(ctx: CanvasRenderingContext2D, m: MorphologyClass | null, r: number, R: () => number) {
  const cx = W / 2 + (R() - 0.5) * 40, cy = H / 2 + (R() - 0.5) * 30;
  const grad = (x: number, y: number, rad: number) => {
    const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad * 1.1);
    g.addColorStop(0, "#f2f2f2");
    g.addColorStop(0.6, "#bdbdbd");
    g.addColorStop(1, "#8a8a8a");
    return g;
  };
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  switch (m) {
    case "spherical": {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad(cx, cy, r);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "angular": {
      const n = 5 + Math.floor(R() * 3);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R() * 0.5;
        const rr = r * (0.6 + R() * 0.6);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      polygon(ctx, pts);
      ctx.fillStyle = grad(cx, cy, r);
      ctx.fill();
      ctx.stroke();
      // 파단면 느낌의 내부 선
      ctx.strokeStyle = "rgba(255,255,255,.5)";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(cx, cy);
      ctx.lineTo(pts[Math.floor(n / 2)][0], pts[Math.floor(n / 2)][1]);
      ctx.stroke();
      break;
    }
    case "platy": {
      ctx.translate(cx, cy);
      ctx.rotate(R() * Math.PI);
      const w = r * 2.2, h = r * 1.1;
      polygon(ctx, [[-w / 2, -h / 2 + R() * 8], [w / 2 - R() * 10, -h / 2], [w / 2, h / 2 - R() * 8], [-w / 2 + R() * 10, h / 2]]);
      ctx.fillStyle = "#cfcfcf";
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(90,90,90,.6)";
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 6, -h / 2 + (i * h) / 4);
        ctx.lineTo(w / 2 - 6, -h / 2 + (i * h) / 4 + 3);
        ctx.stroke();
      }
      break;
    }
    case "fibrous": {
      ctx.translate(cx, cy);
      ctx.rotate(R() * Math.PI);
      const len = r * 4.2, th = Math.max(6, r * 0.45);
      const g = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
      g.addColorStop(0, "#f0f0f0");
      g.addColorStop(1, "#909090");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -th / 2, len, th, th / 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "agglomerate": {
      const n = 7 + Math.floor(R() * 5);
      let x = cx - r * 0.6, y = cy;
      for (let i = 0; i < n; i++) {
        const rr = r * (0.22 + R() * 0.12);
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fillStyle = grad(x, y, rr);
        ctx.fill();
        ctx.stroke();
        const a = R() * Math.PI * 2;
        x = Math.min(Math.max(x + Math.cos(a) * rr * 1.5, cx - r * 1.4), cx + r * 1.4);
        y = Math.min(Math.max(y + Math.sin(a) * rr * 1.5, cy - r * 1.1), cy + r * 1.1);
      }
      break;
    }
    case "irregular": {
      const n = 18;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.7 + R() * 0.45);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      polygon(ctx, pts);
      ctx.fillStyle = grad(cx, cy, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(40,40,40,.75)";
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(cx + (R() - 0.5) * r, cy + (R() - 0.5) * r, 2 + R() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default: {
      ctx.filter = "blur(6px)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.1, r * 0.8, R() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = "#a8a8a8";
      ctx.fill();
    }
  }
  ctx.restore();
}

export function renderDemoImage(meta: ParticleMeta): string | null {
  if (typeof document === "undefined") return null;
  const R = rng(hash(meta.image_filename ?? meta.particle_id));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H + BAR;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  // 배경 + 검출기 잡음
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 50 + (R() - 0.5) * 34;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);

  const umPerPx = micronsPerPixel(meta);
  const rPx = meta.equivalent_diameter && umPerPx ? Math.min(150, Math.max(18, meta.equivalent_diameter / umPerPx / 2)) : 70 + R() * 50;
  drawParticle(ctx, meta.morphology_class, rPx, R);

  // 워터마크
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.35);
  ctx.font = "700 64px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,200,60,0.22)";
  ctx.fillText("DEMO", 0, 20);
  ctx.restore();
  ctx.fillStyle = "rgba(255,200,60,0.9)";
  ctx.font = "600 13px sans-serif";
  ctx.fillText("DEMO 합성 이미지 — 실제 SEM 사진 아님", 12, 22);

  // 정보바(실제 SEM처럼 하단에 평평한 띠)
  ctx.fillStyle = "#101010";
  ctx.fillRect(0, H, W, BAR);
  ctx.fillStyle = "#e8e8e8";
  ctx.font = "13px monospace";
  ctx.fillText(`${meta.sample_id} / ${meta.particle_id}   ${meta.magnification ? "×" + meta.magnification.toLocaleString() : ""}   SYNTHETIC`, 12, H + 27);
  if (meta.scale_bar_px && meta.scale_bar_value && meta.scale_bar_unit) {
    const x0 = W - 24 - meta.scale_bar_px;
    ctx.fillRect(x0, H + 26, meta.scale_bar_px, 5);
    ctx.textAlign = "center";
    ctx.fillText(`${meta.scale_bar_value} ${meta.scale_bar_unit}`, x0 + meta.scale_bar_px / 2, H + 19);
  }
  return c.toDataURL("image/png");
}

export function demoImagesFor(meta: ParticleMeta[]): ImageAsset[] {
  const out: ImageAsset[] = [];
  for (const m of meta) {
    if (!m.image_filename) continue;
    const url = renderDemoImage(m);
    if (!url) continue;
    out.push({ filename: m.image_filename, url, width: W, height: H + BAR, origin: "demo", note: "DEMO 합성 이미지(실제 SEM 사진 아님)", synthetic: true });
  }
  return out;
}
