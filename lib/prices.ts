// Grocery prices: what an ingredient costs at each supermarket, checked
// every morning (Coles, Woolworths, Aldi, Harris Farm) or read off a receipt
// by Claude (Costco keeps its warehouse prices offline). None of the
// supermarkets has a public API, so each is read the way its own website
// reads it. The parsers are pure, so they're testable; search() fetches.
import type { SupabaseClient } from "@supabase/supabase-js";

export const STORES = {
  coles: "Coles",
  woolworths: "Woolworths",
  aldi: "Aldi",
  harris_farm: "Harris Farm",
  costco: "Costco",
} as const;
export type Store = keyof typeof STORES;
/** The ones checked automatically; Costco comes from receipts. */
export const PULLED = ["coles", "woolworths", "aldi", "harris_farm"] as const satisfies Store[];

export type Unit = "kg" | "l" | "each";
export const UNIT_LABEL: Record<Unit, string> = { kg: "kg", l: "L", each: "each" };

/** One product's price on one day, as the store shows it. */
export type Sighting = {
  store: Store;
  product_id: string;
  product: string;
  size: string | null;
  price: number;
  was_price: number | null;
  unit_price: number | null;
  unit: Unit | null;
};

// ---------- sizes and unit prices ----------

const UNITS: Record<string, [Unit, number]> = {
  kg: ["kg", 1], g: ["kg", 0.001], l: ["l", 1], ml: ["l", 0.001],
  ea: ["each", 1], each: ["each", 1], pk: ["each", 1], pack: ["each", 1],
};

/** "2L", "500 g", "6 x 375mL", "per kg", "$1.70 per 1 L", "1EA" → how much, in kg, L or each. The last size mentioned wins. */
export function sizeOf(text: string | null | undefined): { unit: Unit; qty: number; text: string } | null {
  if (!text) return null;
  const s = text.replace(/\bper\s+(?=[a-z])/gi, "per 1 ").replace(/(^|\s)each\b/gi, "$11 each");
  const all = [...s.matchAll(/(?:(\d+)\s*[x×]\s*)?(\d*\.?\d+)\s*(kg|g|ml|l|ea|each|pk|pack)\b/gi)];
  const m = all.at(-1);
  if (!m) return null;
  const [unit, factor] = UNITS[m[3].toLowerCase()];
  const qty = Number(m[1] ?? 1) * Number(m[2]) * factor;
  return qty > 0 ? { unit, qty, text: m[0].replace(/^1 each$/i, "each") } : null;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** price for size (like "100G") → the price per kg, L or each. */
export function perUnit(price: number, size: string | null | undefined): { unit_price: number; unit: Unit } | { unit_price: null; unit: null } {
  const s = sizeOf(size);
  return s ? { unit_price: round(price / s.qty, 4), unit: s.unit } : { unit_price: null, unit: null };
}

/** Products whose name has every word searched for, so "full cream milk" skips milk chocolate. */
export function matches(search: string, name: string): boolean {
  const have = name.toLowerCase();
  return search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => have.includes(w));
}

// ---------- reading each store's search results ----------

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const was = (now: number, then: unknown) => {
  const w = num(then);
  return w !== null && w > now ? w : null;
};

/** Woolworths' search API: Products[].Products[], with a cup price ("$3.50 / 1L"). */
export function fromWoolworths(json: unknown): Sighting[] {
  type P = { Stockcode?: number; DisplayName?: string; Name?: string; PackageSize?: string; Price?: number | null; WasPrice?: number; CupPrice?: number; CupMeasure?: string };
  const groups = (json as { Products?: { Products?: P[] }[] } | null)?.Products ?? [];
  return groups.flatMap((g) => g.Products ?? []).flatMap((p) => {
    const price = num(p.Price);
    if (price === null || !p.Stockcode) return [];
    const cup = num(p.CupPrice);
    return [{
      store: "woolworths" as const, product_id: String(p.Stockcode), product: p.DisplayName ?? p.Name ?? "", size: p.PackageSize || null,
      price, was_price: was(price, p.WasPrice), ...(cup !== null ? perUnit(cup, p.CupMeasure) : perUnit(price, p.PackageSize || p.DisplayName)),
    }];
  });
}

// A page without its data is a bot check ("Pardon Our Interruption") or a redesign. Either way, skip it today
// rather than record nothing.
const NO_DATA = "no products on the page: a bot check, or the site changed";

/** Coles' search page: the results in its __NEXT_DATA__, with ads and other tiles mixed in. */
export function fromColes(html: string): Sighting[] {
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error(NO_DATA);
  type P = { _type?: string; id?: number; name?: string; brand?: string; size?: string; pricing?: { now?: number; was?: number; comparable?: string } | null };
  const results: P[] = JSON.parse(json)?.props?.pageProps?.searchResults?.results ?? [];
  return results.flatMap((p) => {
    const price = num(p.pricing?.now);
    if (p._type !== "PRODUCT" || price === null || !p.id) return [];
    // "$4.90/ 1kg": its unit fields disagree with it for things sold by weight, like bananas.
    const [each, per] = (p.pricing?.comparable ?? "").split("/");
    const unitPrice = num(each?.replace(/[^\d.]/g, ""));
    const product = [p.brand, p.name, p.size].filter(Boolean).join(" ");
    return [{
      store: "coles" as const, product_id: String(p.id), product, size: p.size || null,
      price, was_price: was(price, p.pricing?.was),
      ...(unitPrice !== null && sizeOf(per) ? perUnit(unitPrice, per) : perUnit(price, p.size || product)),
    }];
  });
}

/**
 * Nuxt's page data (__NUXT_DATA__) is one flat array where objects point at
 * their values by index. This follows the indexes back into plain values.
 */
export function unflatten(flat: unknown[]): unknown {
  const seen = new Map<number, unknown>();
  const at = (i: unknown): unknown => {
    if (typeof i !== "number" || i < 0) return undefined;
    if (seen.has(i)) return seen.get(i);
    const v = flat[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && /^(Shallow)?(Reactive|Ref)$|^EmptyRef$/.test(v[0])) return at(v[1]);
      const out: unknown[] = [];
      seen.set(i, out);
      for (const x of v) out.push(at(x));
      return out;
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      seen.set(i, out);
      for (const [k, x] of Object.entries(v)) out[k] = at(x);
      return out;
    }
    return v;
  };
  return at(0);
}

/** Aldi's search page: products in its Nuxt data, prices in cents, with a comparison price ("$1.70 per 1 L"). */
export function fromAldi(html: string): Sighting[] {
  const json = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error(NO_DATA);
  type P = { sku?: string; name?: string; brandName?: string | null; sellingSize?: string | null; price?: { amountRelevant?: number; amount?: number; comparison?: number | null; comparisonDisplay?: string | null; wasPriceDisplay?: string | null } };
  const found: P[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const p = v as P & Record<string, unknown>;
    if (typeof p.sku === "string" && p.price && typeof p.price === "object") found.push(p);
    else Object.values(p).forEach(walk);
  };
  walk(unflatten(JSON.parse(json)));
  const unique = [...new Map(found.map((p) => [p.sku, p])).values()];
  return unique.flatMap((p) => {
    const cents = num(p.price?.amountRelevant ?? p.price?.amount);
    if (cents === null) return [];
    const price = cents / 100;
    const comparison = num(p.price?.comparison);
    const wasText = p.price?.wasPriceDisplay?.match(/\d+\.\d{2}/)?.[0];
    const product = [p.brandName, p.name].filter(Boolean).join(" ");
    const per = p.price?.comparisonDisplay?.split(/per/i)[1];
    return [{
      store: "aldi" as const, product_id: p.sku!.replace(/^0+/, ""), product, size: p.sellingSize || null,
      price, was_price: was(price, wasText),
      // Loose fruit has neither, just "Cavendish Bananas per kg".
      ...(comparison !== null && sizeOf(per) ? perUnit(comparison / 100, per) : perUnit(price, p.sellingSize || product)),
    }];
  });
}

/** Harris Farm's (Shopify) search suggestions. No unit prices, so the size comes from the title ("Full Cream Milk 2L"). */
export function fromHarrisFarm(json: unknown): Sighting[] {
  type P = { id?: number; title?: string; price?: string; compare_at_price_min?: string; available?: boolean };
  const products: P[] = (json as { resources?: { results?: { products?: P[] } } } | null)?.resources?.results?.products ?? [];
  return products.flatMap((p) => {
    const price = num(p.price);
    if (price === null || !p.id || p.available === false) return [];
    return [{
      store: "harris_farm" as const, product_id: String(p.id), product: p.title ?? "", size: sizeOf(p.title)?.text ?? null,
      price, was_price: was(price, p.compare_at_price_min), ...perUnit(price, p.title),
    }];
  });
}

// ---------- fetching ----------

const BROWSER = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "accept-language": "en-AU,en;q=0.9",
};

async function get(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...BROWSER, ...init.headers }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).host} said ${res.status}`);
  return res;
}

// Woolworths' API wants the cookies its home page hands out; one visit does for a whole run.
let woolworthsCookies: Promise<string> | null = null;
const cookiesFor = () =>
  (woolworthsCookies ??= get("https://www.woolworths.com.au/")
    .then((r) => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "))
    .catch((e) => {
      woolworthsCookies = null;
      throw e;
    }));

const READ: Record<(typeof PULLED)[number], (q: string) => Promise<Sighting[]>> = {
  woolworths: async (q) => {
    const res = await get("https://www.woolworths.com.au/apis/ui/Search/products", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", cookie: await cookiesFor() },
      body: JSON.stringify({ SearchTerm: q, PageSize: 24, PageNumber: 1, SortType: "TraderRelevance", Location: `/shop/search/products?searchTerm=${encodeURIComponent(q)}` }),
    });
    return fromWoolworths(await res.json());
  },
  coles: async (q) => fromColes(await (await get(`https://www.coles.com.au/search/products?q=${encodeURIComponent(q)}`)).text()),
  aldi: async (q) => fromAldi(await (await get(`https://www.aldi.com.au/results?q=${encodeURIComponent(q)}`)).text()),
  harris_farm: async (q) =>
    fromHarrisFarm(await (await get(`https://www.harrisfarm.com.au/search/suggest.json?q=${encodeURIComponent(q)}&resources%5Btype%5D=product&resources%5Blimit%5D=10`)).json()),
};

/** Keep this many matching products per store per day: enough to see the cheap option, few enough to stay readable. */
export const PER_STORE = 3;

/** What one store has for a search: its first few products with every word in the name. */
export async function search(store: (typeof PULLED)[number], q: string): Promise<Sighting[]> {
  const found = (await READ[store](q)).filter((s) => s.product && matches(q, s.product));
  return [...new Map(found.map((s) => [s.product_id, s])).values()].slice(0, PER_STORE);
}

/** A pause between one store's searches, so a morning's check is a trickle rather than a burst. */
const GAP_MS = 1500;

/**
 * Checks every store for each ingredient and saves today's prices. Stores run
 * side by side, each ingredient in turn; a store that fails twice running is
 * left alone until tomorrow. db is a secret-key client: prices are written by
 * the server only.
 */
export async function pull(db: SupabaseClient, items: { id: string; household_id: string; search: string }[], today: string) {
  const failed: string[] = [];
  let saved = 0;
  // ponytail: one run checks everything in turn (about 4 s an ingredient); split it up past ~60 ingredients.
  await Promise.all(
    PULLED.map(async (store) => {
      let misses = 0;
      for (const [i, item] of items.entries()) {
        if (i) await new Promise((r) => setTimeout(r, GAP_MS));
        try {
          const found = await search(store, item.search);
          misses = 0;
          if (found.length === 0) continue;
          const { error } = await db.from("prices").upsert(
            found.map((s) => ({ ...s, household_id: item.household_id, item_id: item.id, seen_on: today, source: "pull" })),
            { onConflict: "item_id,store,product_id,seen_on" },
          );
          if (error) throw error;
          saved += found.length;
        } catch (e) {
          failed.push(`${STORES[store]}, "${item.search}": ${e instanceof Error ? e.message : JSON.stringify(e)}`);
          if (++misses === 2) break;
        }
      }
    }),
  );
  return { saved, failed };
}

// ---------- reading the history ----------

/** The unit most of an ingredient's prices are in (milk in L, even if chocolate milk-bar slipped in by kg). */
export function mainUnit(rows: { unit: Unit | null }[]): Unit | null {
  const counts = new Map<Unit, number>();
  for (const r of rows) if (r.unit) counts.set(r.unit, (counts.get(r.unit) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export const money = (n: number) => `$${n.toFixed(2)}`;
/** "$1.65/L", or per 100 g when a kilo would mislead (spices, saffron). */
export function unitMoney(n: number, unit: Unit) {
  if (unit === "kg" && n >= 100) return `${money(n / 10)}/100 g`;
  return `${money(n)}/${UNIT_LABEL[unit]}`;
}
