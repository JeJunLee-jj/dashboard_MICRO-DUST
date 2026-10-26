/* 전역 상태: 데이터셋 · 설정 · 규칙 · 필터 · 라우트.
   업로드 데이터는 브라우저 메모리에만 있다(서버 전송 없음). 설정·규칙·형상 수정값만 localStorage에 남긴다. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AnalysisSettings, DataOrigin, Filters, HazardRule, ImageAsset, Particle, ParticleMeta, QualityIssue, UserOverride } from "../lib/types";
import { EMPTY_FILTERS } from "../lib/types";
import { DEFAULT_HAZARD_RULES, DEFAULT_SETTINGS } from "../config/defaults";
import { DEFAULT_CLASSIFICATION_RULES, type ClassificationRules } from "../lib/rules";
import { EMPTY_DATASET, joinState, mergeLoad, type DatasetState } from "../lib/dataset";
import { loadTableFile, type TableKind, type TableLoadResult } from "../lib/parse/loader";
import { buildParticleFromPair, type PairInput } from "../lib/register";
import { buildBackup, clearSavedDataset, loadDataset, loadSharedDataset, readBackup, saveDataset, type BackupContent } from "../lib/persist";
import { downloadText } from "../lib/exports";
import { isImageName, isCsvName, isSpreadsheetName } from "../lib/parse/tabular";
import { loadImageFile } from "../lib/image/decode";
import { demoImagesFor } from "../lib/image/demoImages";
import { DEMO_FILES } from "../lib/bundledFiles";
import { applyFilters } from "../lib/filters";
import { colorOrder } from "../lib/viewModels";
import type { Unmatched } from "../lib/join";
import { DEFAULT_SIM, normalizeSim, type SimSettings } from "../lib/sources";

const LS = {
  settings: "semeds.settings.v1",
  hazard: "semeds.hazardRules.v1",
  rules: "semeds.classRules.v1",
  overrides: "semeds.overrides.v1",
  sim: "semeds.sim.v2",
};
function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장 불가 환경(시크릿 모드 등)에서는 무시 */
  }
}

export interface Route {
  page: "simulator" | "hazard" | "particles" | "data";
  particleKey?: string;
}

function parseHash(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
  const [page, ...rest] = h.split("/");
  const pages: Route["page"][] = ["simulator", "hazard", "particles", "data"];
  const p = (pages as string[]).includes(page) ? (page as Route["page"]) : "simulator";
  return { page: p, particleKey: p === "particles" && rest.length ? rest.join("/") : undefined };
}

export function hrefFor(r: Route): string {
  return `#/${r.page}${r.particleKey ? "/" + encodeURIComponent(r.particleKey) : ""}`;
}

interface Store {
  data: DatasetState;
  settings: AnalysisSettings;
  hazardRules: HazardRule[];
  rules: ClassificationRules;
  filters: Filters;
  route: Route;
  busy: string | null;
  particles: Particle[];
  filtered: Particle[];
  unmatched: Unmatched;
  /** 파일 검사 + 결합 검사 + 입자별 경고(경고·오류 수준)를 합친 품질 검사 목록 */
  allIssues: QualityIssue[];
  colorOrder: string[];
  origin: DataOrigin | null;
  navigate(r: Route): void;
  setFilters(f: Filters | ((f: Filters) => Filters)): void;
  setSettings(s: AnalysisSettings): void;
  setHazardRules(r: HazardRule[]): void;
  setRules(r: ClassificationRules): void;
  setOverride(key: string, o: UserOverride | null): void;
  loadDemo(): Promise<void>;
  clearData(): void;
  uploadFiles(files: File[], forced?: TableKind): Promise<{ ok: number; failed: string[] }>;
  /** 이미지 + EDS 한 쌍을 입자로 등록. 등록된 입자 키 목록을 돌려준다 */
  registerParticles(inputs: PairInput[], opts?: { replace?: boolean }): string[];
  /** 입자 메타데이터 일부 수정(이미지 측정값 저장 등) */
  updateMeta(key: string, patch: Partial<ParticleMeta>): void;
  /** 여러 입자 메타데이터를 한 번에 수정(일괄 측정) */
  updateMetaMany(patches: Record<string, Partial<ParticleMeta>>): void;
  /** 위치별 기준 시뮬레이터 설정 */
  sim: SimSettings;
  setSim(s: SimSettings | ((s: SimSettings) => SimSettings)): void;
  persist: PersistState;
  restoreSaved(): Promise<void>;
  exportBackup(): Promise<void>;
  importBackup(file: File): Promise<string>;
  /** 배포판에 들어 있는 공유 데이터셋(있으면) */
  sharedInfo: { savedAt: string; note: string | null; particles: number; images: number } | null;
  loadShared(): Promise<void>;
}

export interface PersistState {
  status: "idle" | "restored" | "saving" | "saved" | "error" | "unavailable";
  savedAt?: string;
  message?: string;
  hasSaved?: boolean;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DatasetState>(() => ({ ...EMPTY_DATASET, overrides: readLS(LS.overrides, {}) }));
  const [settings, setSettingsState] = useState<AnalysisSettings>(() => ({ ...DEFAULT_SETTINGS, ...readLS<Partial<AnalysisSettings>>(LS.settings, {}) }));
  const [hazardRules, setHazardState] = useState<HazardRule[]>(() => readLS(LS.hazard, DEFAULT_HAZARD_RULES));
  const [rules, setRulesState] = useState<ClassificationRules>(() => readLS(LS.rules, DEFAULT_CLASSIFICATION_RULES));
  const [sim, setSimState] = useState<SimSettings>(() => normalizeSim(readLS<Partial<SimSettings>>(LS.sim, DEFAULT_SIM)));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [route, setRoute] = useState<Route>(parseHash);
  const [busy, setBusy] = useState<string | null>(null);
  const [persist, setPersist] = useState<PersistState>({ status: "idle" });
  const restoreDone = useRef(false);
  const sharedRef = useRef<BackupContent | null>(null);
  const [sharedInfo, setSharedInfo] = useState<Store["sharedInfo"]>(null);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = hrefFor(r);
    window.scrollTo({ top: 0 });
  }, []);

  const setSettings = useCallback((s: AnalysisSettings) => {
    setSettingsState(s);
    writeLS(LS.settings, s);
  }, []);
  const setHazardRules = useCallback((r: HazardRule[]) => {
    setHazardState(r);
    writeLS(LS.hazard, r);
  }, []);
  const setSim = useCallback((v: SimSettings | ((s: SimSettings) => SimSettings)) => {
    setSimState((cur) => {
      const next = typeof v === "function" ? v(cur) : v;
      writeLS(LS.sim, next);
      return next;
    });
  }, []);
  const setRules = useCallback((r: ClassificationRules) => {
    setRulesState(r);
    writeLS(LS.rules, r);
  }, []);
  const setOverride = useCallback((key: string, o: UserOverride | null) => {
    setData((d) => {
      const overrides = { ...d.overrides };
      if (o === null) delete overrides[key];
      else overrides[key] = { ...overrides[key], ...o };
      writeLS(LS.overrides, overrides);
      return { ...d, overrides };
    });
  }, []);

  const revokeImages = (imgs: ImageAsset[]) => {
    for (const i of imgs) if (i.url.startsWith("blob:")) URL.revokeObjectURL(i.url);
  };

  const clearData = useCallback(() => {
    setData((d) => {
      revokeImages(d.images);
      // 사용자 데이터를 비우면 자동 저장본도 지운다(DEMO를 비울 때는 저장본 유지)
      if (d.origin === "user") clearSavedDataset().then(() => setPersist({ status: "idle", hasSaved: false })).catch(() => undefined);
      return { ...EMPTY_DATASET, overrides: d.overrides };
    });
    setFilters(EMPTY_FILTERS);
  }, []);

  /* ---- 자동 저장(IndexedDB): 시작할 때 복원, 사용자 데이터가 바뀌면 저장 ---- */
  // 공유 데이터셋 적용: 처음 방문(설정 저장 기록 없음)이면 분석 설정·규칙도 스냅샷 것으로 맞춘다
  const applyShared = useCallback((r: BackupContent, applySettings: boolean) => {
    setData((d) => {
      revokeImages(d.images);
      return { ...r.state, origin: "user", shared: { savedAt: r.savedAt, note: r.note }, overrides: { ...r.state.overrides, ...readLS<Record<string, UserOverride>>(LS.overrides, {}) } };
    });
    if (applySettings) {
      const ex = r.extras as { settings?: AnalysisSettings; hazardRules?: HazardRule[]; rules?: ClassificationRules; sim?: Partial<SimSettings> };
      if (ex.settings) setSettingsState({ ...DEFAULT_SETTINGS, ...ex.settings });
      if (ex.hazardRules) setHazardState(ex.hazardRules);
      if (ex.rules) setRulesState(ex.rules);
      if (ex.sim) setSimState(normalizeSim(ex.sim));
    }
    setFilters(EMPTY_FILTERS);
  }, []);

  useEffect(() => {
    (async () => {
      let own: Awaited<ReturnType<typeof loadDataset>> = null;
      try {
        own = await loadDataset();
      } catch {
        setPersist({ status: "unavailable", message: "이 브라우저에서는 자동 저장을 쓸 수 없습니다. 백업 파일로 보관하세요." });
      }
      const shared = await loadSharedDataset().catch(() => null);
      sharedRef.current = shared;
      if (shared) setSharedInfo({ savedAt: shared.savedAt, note: shared.note, particles: shared.state.meta.length, images: shared.state.images.length });
      if (own && own.state.origin === "user") {
        setData((d) => (d.origin ? d : { ...own.state, overrides: { ...own.state.overrides, ...d.overrides } }));
        setPersist({ status: "restored", savedAt: own.savedAt, hasSaved: true });
      } else if (shared) {
        let firstVisit = true;
        try {
          firstVisit = localStorage.getItem(LS.settings) == null;
        } catch {
          /* 무시 */
        }
        applyShared(shared, firstVisit);
      }
      restoreDone.current = true;
    })();
  }, [applyShared]);

  const loadShared = useCallback(async () => {
    const r = sharedRef.current ?? (await loadSharedDataset());
    if (r) applyShared(r, true);
  }, [applyShared]);

  useEffect(() => {
    // 공유 스냅샷을 그대로 보고 있는 동안은 저장하지 않는다(새 배포가 나오면 그대로 반영되도록). 바꾸면 내 데이터로 저장
    if (!restoreDone.current || data.origin !== "user" || data.shared) return;
    const t = setTimeout(() => {
      setPersist((p) => ({ ...p, status: "saving" }));
      saveDataset(data)
        .then((savedAt) => setPersist({ status: "saved", savedAt, hasSaved: true }))
        .catch((e) => setPersist({ status: "error", message: `자동 저장 실패: ${(e as Error).message}. 백업 파일로 보관하세요.` }));
    }, 600);
    return () => clearTimeout(t);
  }, [data]);

  const restoreSaved = useCallback(async () => {
    const r = await loadDataset();
    if (!r) return;
    setData((d) => {
      revokeImages(d.images);
      return { ...r.state, overrides: { ...r.state.overrides } };
    });
    setFilters(EMPTY_FILTERS);
    setPersist({ status: "restored", savedAt: r.savedAt, hasSaved: true });
  }, []);

  const exportBackup = useCallback(async () => {
    setBusy("백업 파일을 만드는 중…");
    try {
      const json = await buildBackup(data, { settings, hazardRules, rules, sim });
      downloadText(`SEM-EDS_backup${data.origin === "demo" ? "_DEMO" : ""}_${new Date().toISOString().slice(0, 10)}.json`, json, "application/json");
    } finally {
      setBusy(null);
    }
  }, [data, settings, hazardRules, rules, sim]);

  const importBackup = useCallback(async (file: File) => {
    setBusy("백업 파일을 불러오는 중…");
    try {
      const r = await readBackup(await file.text());
      setData((d) => {
        revokeImages(d.images);
        return r.state;
      });
      const ex = r.extras as { settings?: AnalysisSettings; hazardRules?: HazardRule[]; rules?: ClassificationRules; sim?: Partial<SimSettings> };
      if (ex.settings) setSettings({ ...DEFAULT_SETTINGS, ...ex.settings });
      if (ex.hazardRules) setHazardRules(ex.hazardRules);
      if (ex.rules) setRules(ex.rules);
      if (ex.sim) setSim(normalizeSim(ex.sim));
      setFilters(EMPTY_FILTERS);
      return `백업(${new Date(r.savedAt).toLocaleString("ko-KR")})을 불러왔습니다 — 입자 메타데이터 ${r.state.meta.length}건, 이미지 ${r.state.images.length}장.`;
    } finally {
      setBusy(null);
    }
  }, [setSettings, setHazardRules, setRules, setSim]);

  const updateMeta = useCallback((key: string, patch: Partial<ParticleMeta>) => {
    setData((d) => ({ ...d, shared: null, meta: d.meta.map((m) => (`${m.sample_id}::${m.particle_id}` === key ? { ...m, ...patch } : m)) }));
  }, []);

  const updateMetaMany = useCallback((patches: Record<string, Partial<ParticleMeta>>) => {
    setData((d) => ({ ...d, shared: null, meta: d.meta.map((m) => {
      const p = patches[`${m.sample_id}::${m.particle_id}`];
      return p ? { ...m, ...p } : m;
    }) }));
  }, []);

  const registerParticles = useCallback((inputs: PairInput[], opts?: { replace?: boolean }) => {
    const results = inputs.map(buildParticleFromPair);
    const now = new Date().toISOString();
    setData((d) => {
      // DEMO 위에 실제 데이터를 섞지 않는다
      const fresh = d.origin === "demo" || !!opts?.replace;
      const base: DatasetState = fresh ? { ...EMPTY_DATASET, overrides: {} } : d;
      if (fresh) revokeImages(d.images);
      const images = [...base.images];
      const metas = results.map((r) => r.meta);
      inputs.forEach((inp, i) => {
        if (!inp.image) return;
        let img = inp.image;
        const key = `${inp.sample_id}::${inp.particle_id}`;
        // 같은 파일명의 이미지가 다른 입자에 이미 쓰이고 있으면 이름을 바꿔 잘못 연결되지 않게 한다
        const clash = base.meta.some((m) => m.image_filename?.toLowerCase() === img.filename.toLowerCase() && `${m.sample_id}::${m.particle_id}` !== key)
          || inputs.some((o, j) => j < i && o.image?.filename.toLowerCase() === img.filename.toLowerCase());
        if (clash) {
          img = { ...img, filename: `${inp.sample_id}_${inp.particle_id}__${img.filename}`, note: [img.note, `원본 파일명: ${inp.image.filename}`].filter(Boolean).join(" · ") };
          metas[i] = { ...metas[i], image_filename: img.filename };
        }
        const at = images.findIndex((x) => x.filename.toLowerCase() === img.filename.toLowerCase());
        if (at >= 0) images[at] = img;
        else images.push(img);
      });
      const load: TableLoadResult = {
        meta: metas,
        eds: results.flatMap((r) => r.eds),
        hazardRules: null,
        pm: [],
        issues: results.flatMap((r) => r.issues),
        files: inputs.map((inp) => ({ name: [inp.image?.filename, inp.edsName].filter(Boolean).join(" + "), kind: "pair" as const, rows: 1, origin: "user" as const, loadedAt: now, note: `${inp.sample_id} / ${inp.particle_id}` })),
        edsSummaries: results.map((r) => r.edsSummary).filter((x): x is NonNullable<typeof x> => !!x),
      };
      const merged = mergeLoad(base, load, "user").state;
      return { ...merged, images };
    });
    return inputs.map((i) => `${i.sample_id}::${i.particle_id}`);
  }, []);

  const loadDemo = useCallback(async () => {
    setBusy("DEMO 데이터를 불러오는 중…");
    try {
      // DEMO CSV는 번들에 포함되어 있어 fetch 없이 읽는다(오프라인판에서도 동작). 실제 파일과 같은 파서를 거친다.
      let state: DatasetState = { ...EMPTY_DATASET };
      for (const f of DEMO_FILES) {
        state = mergeLoad(state, loadTableFile(new TextEncoder().encode(f.text), f.name, "demo"), "demo").state;
      }
      state.images = demoImagesFor(state.meta);
      state.files.push({ name: `DEMO 합성 이미지 ${state.images.length}장`, kind: "image", rows: state.images.length, origin: "demo", loadedAt: new Date().toISOString(), note: "브라우저에서 그린 합성 그림(실제 SEM 사진 아님)" });
      setData((d) => {
        revokeImages(d.images);
        // DEMO 입자에 대한 형상 수정값만 유지
        const overrides = Object.fromEntries(Object.entries(d.overrides).filter(([k]) => k.startsWith("DEMO")));
        return { ...state, overrides };
      });
      setFilters(EMPTY_FILTERS);
    } finally {
      setBusy(null);
    }
  }, []);

  const uploadFiles = useCallback(async (files: File[], forced?: TableKind) => {
    const failed: string[] = [];
    let ok = 0;
    setBusy(`파일 ${files.length}개 처리 중…`);
    try {
      // DEMO 위에 실제 데이터를 섞지 않는다
      let base: DatasetState = data.origin === "demo" ? { ...EMPTY_DATASET, overrides: data.overrides } : data;
      if (data.origin === "demo") revokeImages(data.images);
      const images: ImageAsset[] = [...base.images];
      const extraIssues: QualityIssue[] = [];
      for (const f of files) {
        if (isImageName(f.name)) {
          try {
            const img = await loadImageFile(f, "user");
            const i = images.findIndex((x) => x.filename.toLowerCase() === img.filename.toLowerCase());
            if (i >= 0) {
              revokeImages([images[i]]);
              images[i] = img;
            } else images.push(img);
            base = { ...base, files: [...base.files, { name: f.name, kind: "image", rows: 1, origin: "user", loadedAt: new Date().toISOString(), note: img.note ?? undefined }] };
            ok++;
          } catch (e) {
            failed.push(f.name);
            extraIssues.push({ level: "error", code: "IMAGE_LOAD_FAILED", file: f.name, message: (e as Error).message });
          }
        } else if (isCsvName(f.name) || isSpreadsheetName(f.name)) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const res = loadTableFile(bytes, f.name, "user", forced);
          const merged = mergeLoad(base, res, "user");
          base = merged.state;
          if (merged.hazardRules?.length) {
            setHazardRules(merged.hazardRules);
            extraIssues.push({ level: "info", code: "RULES_LOADED", file: f.name, message: `위해성 평가 규칙 ${merged.hazardRules.length}건을 적용했습니다.` });
          }
          if (res.files.some((x) => x.kind === "unknown") || res.issues.some((x) => x.code === "FILE_READ_FAILED")) failed.push(f.name);
          else ok++;
        } else {
          failed.push(f.name);
          extraIssues.push({ level: "error", code: "FILE_TYPE", file: f.name, message: "지원하지 않는 파일 형식입니다. 표: CSV·XLSX, 이미지: JPG·PNG·TIFF" });
        }
      }
      setData({ ...base, origin: "user", images, issues: [...base.issues, ...extraIssues] });
    } finally {
      setBusy(null);
    }
    return { ok, failed };
  }, [data, setHazardRules]);

  const joined = useMemo(() => joinState(data, settings), [data, settings]);
  const filtered = useMemo(() => applyFilters(joined.particles, filters, settings), [joined.particles, filters, settings]);
  const order = useMemo(() => colorOrder(joined.particles, settings), [joined.particles, settings]);
  const allIssues = useMemo<QualityIssue[]>(() => [
    ...data.issues,
    ...joined.issues,
    ...joined.particles.flatMap((p) => p.flags.filter((f) => f.level !== "info").map((f) => ({ level: f.level, code: f.code, message: f.message, particleKey: p.key }))),
  ], [data.issues, joined]);

  const value: Store = {
    data, settings, hazardRules, rules, filters, route, busy,
    particles: joined.particles, filtered, unmatched: joined.unmatched, allIssues,
    colorOrder: order, origin: data.origin,
    navigate, setFilters, setSettings, setHazardRules, setRules, setOverride, loadDemo, clearData, uploadFiles,
    registerParticles, updateMeta, updateMetaMany, sim, setSim, persist, restoreSaved, exportBackup, importBackup, sharedInfo, loadShared,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider 밖에서 useStore를 호출했습니다.");
  return s;
}
