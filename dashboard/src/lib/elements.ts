/* 원소 기호·이름 표준화. EDS 소프트웨어마다 "Fe", "FE", "Fe K", "Iron", "철" 처럼 다르게 내보낸다. */

const TABLE: Array<[string, string, string]> = [
  // [기호, 영문명, 국문명]
  ["H", "Hydrogen", "수소"], ["He", "Helium", "헬륨"], ["Li", "Lithium", "리튬"], ["Be", "Beryllium", "베릴륨"],
  ["B", "Boron", "붕소"], ["C", "Carbon", "탄소"], ["N", "Nitrogen", "질소"], ["O", "Oxygen", "산소"],
  ["F", "Fluorine", "플루오린"], ["Ne", "Neon", "네온"], ["Na", "Sodium", "나트륨"], ["Mg", "Magnesium", "마그네슘"],
  ["Al", "Aluminium", "알루미늄"], ["Si", "Silicon", "규소"], ["P", "Phosphorus", "인"], ["S", "Sulfur", "황"],
  ["Cl", "Chlorine", "염소"], ["Ar", "Argon", "아르곤"], ["K", "Potassium", "칼륨"], ["Ca", "Calcium", "칼슘"],
  ["Sc", "Scandium", "스칸듐"], ["Ti", "Titanium", "티타늄"], ["V", "Vanadium", "바나듐"], ["Cr", "Chromium", "크롬"],
  ["Mn", "Manganese", "망간"], ["Fe", "Iron", "철"], ["Co", "Cobalt", "코발트"], ["Ni", "Nickel", "니켈"],
  ["Cu", "Copper", "구리"], ["Zn", "Zinc", "아연"], ["Ga", "Gallium", "갈륨"], ["Ge", "Germanium", "저마늄"],
  ["As", "Arsenic", "비소"], ["Se", "Selenium", "셀레늄"], ["Br", "Bromine", "브로민"], ["Kr", "Krypton", "크립톤"],
  ["Rb", "Rubidium", "루비듐"], ["Sr", "Strontium", "스트론튬"], ["Y", "Yttrium", "이트륨"], ["Zr", "Zirconium", "지르코늄"],
  ["Nb", "Niobium", "나이오븀"], ["Mo", "Molybdenum", "몰리브데넘"], ["Tc", "Technetium", "테크네튬"], ["Ru", "Ruthenium", "루테늄"],
  ["Rh", "Rhodium", "로듐"], ["Pd", "Palladium", "팔라듐"], ["Ag", "Silver", "은"], ["Cd", "Cadmium", "카드뮴"],
  ["In", "Indium", "인듐"], ["Sn", "Tin", "주석"], ["Sb", "Antimony", "안티모니"], ["Te", "Tellurium", "텔루륨"],
  ["I", "Iodine", "아이오딘"], ["Xe", "Xenon", "제논"], ["Cs", "Caesium", "세슘"], ["Ba", "Barium", "바륨"],
  ["La", "Lanthanum", "란타넘"], ["Ce", "Cerium", "세륨"], ["Pr", "Praseodymium", "프라세오디뮴"], ["Nd", "Neodymium", "네오디뮴"],
  ["Pm", "Promethium", "프로메튬"], ["Sm", "Samarium", "사마륨"], ["Eu", "Europium", "유로퓸"], ["Gd", "Gadolinium", "가돌리늄"],
  ["Tb", "Terbium", "터븀"], ["Dy", "Dysprosium", "디스프로슘"], ["Ho", "Holmium", "홀뮴"], ["Er", "Erbium", "어븀"],
  ["Tm", "Thulium", "툴륨"], ["Yb", "Ytterbium", "이터븀"], ["Lu", "Lutetium", "루테튬"], ["Hf", "Hafnium", "하프늄"],
  ["Ta", "Tantalum", "탄탈럼"], ["W", "Tungsten", "텅스텐"], ["Re", "Rhenium", "레늄"], ["Os", "Osmium", "오스뮴"],
  ["Ir", "Iridium", "이리듐"], ["Pt", "Platinum", "백금"], ["Au", "Gold", "금"], ["Hg", "Mercury", "수은"],
  ["Tl", "Thallium", "탈륨"], ["Pb", "Lead", "납"], ["Bi", "Bismuth", "비스무트"], ["Po", "Polonium", "폴로늄"],
  ["Th", "Thorium", "토륨"], ["U", "Uranium", "우라늄"],
];

const BY_SYMBOL = new Map<string, { symbol: string; en: string; ko: string }>();
const BY_NAME = new Map<string, string>();
for (const [s, en, ko] of TABLE) {
  BY_SYMBOL.set(s.toLowerCase(), { symbol: s, en, ko });
  BY_NAME.set(en.toLowerCase(), s);
  BY_NAME.set(ko, s);
}
BY_NAME.set("aluminum", "Al");
BY_NAME.set("sulphur", "S");
BY_NAME.set("cesium", "Cs");
BY_NAME.set("크로뮴", "Cr");
BY_NAME.set("니켈", "Ni");
BY_NAME.set("실리콘", "Si");
BY_NAME.set("티타늄", "Ti");
BY_NAME.set("타이타늄", "Ti");

/**
 * 원소 표기를 표준 기호로 바꾼다. 인식하지 못하면 null.
 * 허용 예: "Fe", "FE", "fe", "Fe K", "Fe-K", "FeKa", "Iron", "철", "Fe (철)"
 */
export function normalizeElement(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (BY_NAME.has(lower)) return BY_NAME.get(lower)!;
  if (BY_NAME.has(text)) return BY_NAME.get(text)!;
  // 괄호 안 국문명 제거: "Fe (철)" → "Fe"
  const head = text.replace(/\(.*?\)/g, " ").trim();
  // X선 계열 표기 제거: "Fe K", "Fe-Ka", "FeKα", "Pb M", "Fe L"
  const m = head.match(/^([A-Za-z]{1,2})(?:[\s_\-.]*(?:k|l|m)(?:a|b|α|β|alpha|beta)?\d*)?(?:\s.*)?$/i);
  if (m) {
    const cand = m[1].toLowerCase();
    if (BY_SYMBOL.has(cand)) return BY_SYMBOL.get(cand)!.symbol;
  }
  // "CK", "OK", "SKa" 처럼 대문자 한 글자 기호 + 계열 문자를 붙여 쓴 경우(대소문자 구분)
  const one = head.match(/^([A-Z])(?:K|L|M)(?:a|b|α|β)?$/);
  if (one && BY_SYMBOL.has(one[1].toLowerCase())) return one[1];
  const clean = head.replace(/[^A-Za-z]/g, "").toLowerCase();
  if (BY_NAME.has(clean)) return BY_NAME.get(clean)!;
  if (clean.length <= 2 && BY_SYMBOL.has(clean)) return BY_SYMBOL.get(clean)!.symbol;
  return null;
}

export function elementNameKo(symbol: string): string {
  return BY_SYMBOL.get(symbol.toLowerCase())?.ko ?? symbol;
}
export function elementNameEn(symbol: string): string {
  return BY_SYMBOL.get(symbol.toLowerCase())?.en ?? symbol;
}
export function isElementSymbol(symbol: string): boolean {
  const e = BY_SYMBOL.get(symbol.toLowerCase());
  return !!e && e.symbol === symbol;
}

/** 원소 표시 순서: 원자번호 순 */
export function atomicOrder(symbol: string): number {
  const i = TABLE.findIndex((t) => t[0] === symbol);
  return i < 0 ? 999 : i + 1;
}

/** 초기 검토 대상 원소(사용자가 설정 화면에서 바꿀 수 있다) */
export const DEFAULT_TARGET_ELEMENTS = ["Pb", "Cd", "As", "Cr", "Ni", "Co", "Mn", "Cu", "Zn", "Fe"];
