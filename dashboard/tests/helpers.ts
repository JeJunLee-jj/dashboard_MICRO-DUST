import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTableFile } from "../src/lib/parse/loader";
import { EMPTY_DATASET, mergeLoad, joinState, type DatasetState } from "../src/lib/dataset";
import { DEFAULT_SETTINGS } from "../src/config/defaults";
import type { AnalysisSettings, DataOrigin, ImageAsset } from "../src/lib/types";

export const FIX = join(__dirname, "fixtures");
export const SAMPLE = join(__dirname, "..", "public", "sample-data");

export function bytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

export function settings(over: Partial<AnalysisSettings> = {}): AnalysisSettings {
  return { ...DEFAULT_SETTINGS, targetElements: [...DEFAULT_SETTINGS.targetElements], ...over };
}

export function fakeImage(filename: string, origin: DataOrigin = "user"): ImageAsset {
  return { filename, url: `blob:${filename}`, width: 100, height: 100, origin, note: null, synthetic: origin === "demo" };
}

export function loadFiles(paths: string[], origin: DataOrigin = "user", images: ImageAsset[] = []): DatasetState {
  let state: DatasetState = { ...EMPTY_DATASET, images };
  for (const p of paths) {
    const name = p.replace(/^.*[\\/]/, "");
    state = mergeLoad(state, loadTableFile(bytes(p), name, origin), origin).state;
  }
  return state;
}

export function fixtureDataset(over: Partial<AnalysisSettings> = {}, images: ImageAsset[] = []) {
  const state = loadFiles([join(FIX, "test_metadata.csv"), join(FIX, "test_eds_long.csv")], "user", images);
  const s = settings(over);
  const joined = joinState(state, s);
  return { state, settings: s, ...joined };
}
