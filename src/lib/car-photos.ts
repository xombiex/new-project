// Real photos of the cars in your garage, from Wikimedia Commons: free to use, no API key. The
// licenses ask for credit, so a photo always comes with its author, license and a link to show.

export type CarPhoto = {
  url: string;
  /** The file's page on Commons (the credit links here). */
  pageUrl: string;
  author: string;
  license: string;
};

/** Parts of a car, toys and such: right words in the file name, wrong picture for a garage card. */
const NOT_THE_CAR = /\b(interior|engine|dashboard|cockpit|badges?|emblem|logo|wheels?|rims?|seats?|trunk|boot|details?|steering|gauges?|toys?|hot.?wheels|matchbox|lego|miniature|diecast|die-cast|scale|model car|diagram|drawing|blueprint|sketch|crash(ed)?|wreck(ed)?|accident|damaged|rust|abandoned|burn(ed|t)?|ad|advert|brochure|poster)\b/i;
/** EPA model names carry these ("Tacoma 4WD", "F150 Pickup 2WD"); nobody names a photo that way. */
const SPEC_WORDS = /^(2wd|4wd|awd|fwd|rwd|4x4|4x2|pickup|ffv|hybrid|phev|cab|chassis|automatic|manual)$/i;

const squish = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The words of a model name worth searching for. */
export function cleanModel(model: string): string[] {
  return model.split(/\s+/).filter((w) => w && !SPEC_WORDS.test(w));
}

type Candidate = { title: string; width: number; height: number; mime?: string };

/**
 * How good a Commons file is for this car, or null if it isn't one: names the make and model,
 * landscape and big enough, a photo of the whole car. Best of all, the right year and from the front.
 */
export function scorePhoto(c: Candidate, make: string, model: string, year: number | null): number | null {
  const name = c.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
  if (c.mime && c.mime !== 'image/jpeg') return null;
  if (c.width < 1000 || c.width / c.height < 1.2 || c.width / c.height > 2.2) return null;
  // Leave the make out of it: SEAT is a car company, not a part of one.
  if (NOT_THE_CAR.test(name.replace(new RegExp(make.replace(/[^a-z0-9 ]/gi, ''), 'i'), ''))) return null;
  const words = cleanModel(model);
  const flat = squish(name);
  if (!words[0] || !flat.includes(squish(make)) || !flat.includes(squish(words[0]))) return null;
  let score = 0;
  for (const w of words.slice(1)) if (flat.includes(squish(w))) score += 2;
  if (year) {
    const years = (name.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
    if (years.includes(year)) score += 6;
    else if (years.some((y) => Math.abs(y - year) <= 2)) score += 3;
  }
  if (/front|3\/4|three.?quarter|\bfl\b/i.test(name)) score += 2;
  if (/\brear\b|\bback\b|\bheck\b/i.test(name)) score -= 3;
  return score;
}

/** Author's name out of the HTML Commons stores it as. */
export function plainAuthor(html: string | undefined): string {
  const text = (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 40) || 'Wikimedia Commons';
}

const FREE = /^(cc|public domain|pd)/i;

type ApiPage = {
  title: string;
  imageinfo?: {
    thumburl?: string;
    width: number;
    height: number;
    mime?: string;
    descriptionurl: string;
    extmetadata?: { Artist?: { value: string }; LicenseShortName?: { value: string } };
  }[];
};

/** Picks the best free-licensed photo from a Commons API result. */
export function bestPhoto(pages: ApiPage[], make: string, model: string, year: number | null): CarPhoto | null {
  let best: { score: number; photo: CarPhoto } | null = null;
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const license = info.extmetadata?.LicenseShortName?.value ?? '';
    if (!FREE.test(license) || /\bnc\b|\bnd\b/i.test(license)) continue;
    const score = scorePhoto({ title: p.title, width: info.width, height: info.height, mime: info.mime }, make, model, year);
    if (score == null || (best && best.score >= score)) continue;
    best = { score, photo: { url: info.thumburl, pageUrl: info.descriptionurl, author: plainAuthor(info.extmetadata?.Artist?.value), license } };
  }
  return best?.photo ?? null;
}

async function searchCommons(query: string, make: string, model: string, year: number | null, signal?: AbortSignal): Promise<CarPhoto | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '30',
    gsrsearch: `${query} filetype:bitmap`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '960',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const body = (await res.json()) as { query?: { pages?: Record<string, ApiPage> } };
  return bestPhoto(Object.values(body.query?.pages ?? {}), make, model, year);
}

/** A photo of this car: this year's if there is one, otherwise any year of the model. Null if none suits. */
export async function findCarPhoto(make: string, model: string, year: number | null, signal?: AbortSignal): Promise<CarPhoto | null> {
  const name = `${make} ${cleanModel(model).join(' ')}`.trim();
  if (!make.trim() || !cleanModel(model).length) return null;
  const exact = year ? await searchCommons(`${year} ${name}`, make, model, year, signal) : null;
  return exact ?? searchCommons(name, make, model, year, signal);
}
