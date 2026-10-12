/* 오프라인판 만들기: dist-offline/index.html 에 JS·CSS를 직접 넣어 HTML 파일 하나로 만든다.
   결과 파일은 인터넷·서버·Node.js 없이 더블클릭(file://)으로 열린다.
   실행: npm run build:offline */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist-offline");
let html = readFileSync(join(dist, "index.html"), "utf8");

const read = (rel) => readFileSync(join(dist, rel.replace(/^\.\//, "")), "utf8");

let scripts = 0, styles = 0;
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  scripts++;
  // 인라인 스크립트 안의 "</script"가 태그를 닫지 않도록 이스케이프(문자열·정규식 안에서 "\/"는 "/"와 같다)
  const code = read(src).replace(/<\/script/gi, "<\\/script");
  return `<script type="module">${code}</script>`; // 치환 함수의 반환값은 "$" 패턴 해석 없이 그대로 들어간다
}).replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(\.\/assets\/[^"]+)"[^>]*>/g, (_, href) => {
  styles++;
  return `<style>${read(href)}</style>`;
});

if (scripts !== 1 || styles !== 1) throw new Error(`예상과 다른 구성: script ${scripts}, style ${styles}`);

// 팀 공유 데이터셋(public/shared-data/dataset.json)이 있으면 HTML 안에 넣는다 — 파일 하나로 결과까지 전달
const sharedPath = join(root, "public", "shared-data", "dataset.json");
if (existsSync(sharedPath)) {
  const json = readFileSync(sharedPath, "utf8");
  JSON.parse(json); // 형식 확인
  // HTML 안에서 태그가 닫히지 않도록 "<"와 줄 구분 문자를 이스케이프(JSON 의미는 같음)
  const safe = json.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  html = html.replace("<head>", () => `<head>\n<script>window.__SEMEDS_SHARED__ = ${safe};</script>`);
  console.log(`공유 데이터셋 포함: ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MB`);
} else {
  console.log("공유 데이터셋 없음(public/shared-data/dataset.json) — 데이터 없이 생성");
}
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error("외부 assets 참조가 남아 있습니다.");

const out = join(dist, "SEM-EDS 대시보드 (오프라인).html");
writeFileSync(out, html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`오프라인판 생성: ${out} (${kb} KB)`);

// 상위 작업 폴더(미래설계 대시보드)에도 복사 — 더블클릭으로 바로 열 수 있게
const top = join(root, "..", "..");
if (!process.env.CI && existsSync(join(top, "sem-particle-analyzer"))) {
  copyFileSync(out, join(top, "SEM-EDS 대시보드 (오프라인).html"));
  console.log(`복사: ${join(top, "SEM-EDS 대시보드 (오프라인).html")}`);
}
