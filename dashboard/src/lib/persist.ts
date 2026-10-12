/* 사용자 데이터 보관.
   1) 자동 저장: 브라우저 IndexedDB에 현재 데이터셋(이미지 포함)을 저장해 새로고침·재실행 후에도 복원한다.
      저장 위치는 이 브라우저·이 주소(또는 이 HTML 파일)에 한정된다. DEMO 데이터는 저장하지 않는다.
   2) 백업 파일: 데이터셋 전체(이미지 포함)를 JSON 파일 하나로 내보내고 다시 불러온다 — 다른 PC·팀원과 공유용. */
import type { DatasetState } from "./dataset";
import type { ImageAsset } from "./types";

const DB_NAME = "semeds-dashboard";
const STORE = "dataset";
const KEY = "current";

type StoredImage = Omit<ImageAsset, "url"> & { blob: Blob };
type StoredDataset = Omit<DatasetState, "images"> & { images: StoredImage[]; savedAt: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB 없음"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  }));
}

async function toStoredImages(images: ImageAsset[]): Promise<StoredImage[]> {
  return Promise.all(images.map(async (img) => {
    const blob = await (await fetch(img.url)).blob();
    const { url: _url, ...rest } = img;
    void _url;
    return { ...rest, blob };
  }));
}

export async function saveDataset(state: DatasetState): Promise<string> {
  const savedAt = new Date().toISOString();
  const value: StoredDataset = { ...state, images: await toStoredImages(state.images), savedAt };
  await tx("readwrite", (s) => s.put(value, KEY));
  return savedAt;
}

export async function loadDataset(): Promise<{ state: DatasetState; savedAt: string } | null> {
  const v = (await tx("readonly", (s) => s.get(KEY))) as StoredDataset | undefined;
  if (!v) return null;
  const { savedAt, images, ...rest } = v;
  return { state: { ...rest, images: images.map(({ blob, ...img }) => ({ ...img, url: URL.createObjectURL(blob) })) }, savedAt };
}

export async function clearSavedDataset(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY));
}

/* ---------- 백업 파일 ---------- */

export const BACKUP_FORMAT = "semeds-dashboard-backup";

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  savedAt: string;
  note: string;
  data: Omit<DatasetState, "images">;
  images: Array<Omit<ImageAsset, "url"> & { dataUrl: string }>;
  extras?: Record<string, unknown>;
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function buildBackup(state: DatasetState, extras: Record<string, unknown> = {}): Promise<string> {
  const { images, ...data } = state;
  const out: BackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    note: state.origin === "demo" ? "DEMO(가상) 데이터 백업 — 실제 측정 결과 아님" : "SEM-EDS 대시보드 데이터셋 백업(이미지 포함)",
    data,
    images: await Promise.all(images.map(async (img) => {
      const { url, ...rest } = img;
      return { ...rest, dataUrl: url.startsWith("data:") ? url : await blobToDataUrl(await (await fetch(url)).blob()) };
    })),
    extras,
  };
  return JSON.stringify(out);
}

export interface BackupContent {
  state: DatasetState;
  extras: Record<string, unknown>;
  savedAt: string;
  note: string | null;
}

export async function readBackup(text: string): Promise<BackupContent> {
  let obj: BackupFile;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("백업 파일을 읽을 수 없습니다(JSON 형식 아님).");
  }
  return readBackupObject(obj);
}

export async function readBackupObject(raw: unknown): Promise<BackupContent> {
  const obj = raw as BackupFile;
  if (obj?.format !== BACKUP_FORMAT) throw new Error("이 대시보드의 백업 파일이 아닙니다.");
  const images: ImageAsset[] = await Promise.all(obj.images.map(async ({ dataUrl, ...img }) => {
    const blob = await (await fetch(dataUrl)).blob();
    return { ...img, url: URL.createObjectURL(blob) };
  }));
  return { state: { ...obj.data, images, shared: null }, extras: obj.extras ?? {}, savedAt: obj.savedAt, note: obj.note ?? null };
}

/* ---------- 배포용 공유 데이터셋 ----------
   팀 배포판에 분석 결과를 담아 두는 방법: 백업 파일을 public/shared-data/dataset.json 으로 넣는다
   (scripts/set-shared-data.mjs). 웹 배포판은 그 파일을 읽고, 오프라인 HTML은 빌드할 때 파일 안에 넣는다. */
export const SHARED_DATA_PATH = "shared-data/dataset.json";

export async function loadSharedDataset(): Promise<BackupContent | null> {
  const embedded = (globalThis as { __SEMEDS_SHARED__?: unknown }).__SEMEDS_SHARED__;
  if (embedded) return readBackupObject(embedded);
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${SHARED_DATA_PATH}`, { cache: "no-cache" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return await readBackupObject(await res.json());
  } catch {
    return null; // 공유 데이터셋 없음(또는 file://에서 열어 fetch 불가)
  }
}
