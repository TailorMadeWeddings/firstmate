// The Galley's text handling: ingredients and steps are typed (or pasted)
// one per line, and quantities scale with servings. Pure, so it's testable.

/** The private storage bucket for recipe photos, one folder per recipe. */
export const PHOTO_BUCKET = "recipe-photos";

export type Ingredient = { quantity: number | null; unit: string | null; name: string; notes: string | null };
export type Step = { instruction: string; duration_seconds: number | null };

const FRACTIONS: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

// ponytail: the units a family cookbook actually uses; anything else stays in the name.
const UNITS = new Map(
  Object.entries({
    cup: ["cup", "cups", "c"],
    tbsp: ["tbsp", "tbs", "tablespoon", "tablespoons"],
    tsp: ["tsp", "teaspoon", "teaspoons"],
    g: ["g", "gram", "grams", "gm"],
    kg: ["kg", "kgs", "kilogram", "kilograms"],
    ml: ["ml", "millilitre", "millilitres", "milliliter", "milliliters"],
    l: ["l", "litre", "litres", "liter", "liters"],
    oz: ["oz", "ounce", "ounces"],
    lb: ["lb", "lbs", "pound", "pounds"],
    pinch: ["pinch", "pinches"],
    clove: ["clove", "cloves"],
    can: ["can", "cans", "tin", "tins"],
    bunch: ["bunch", "bunches"],
    handful: ["handful", "handfuls"],
    slice: ["slice", "slices"],
    sprig: ["sprig", "sprigs"],
    packet: ["packet", "packets", "pkt"],
    stick: ["stick", "sticks"],
    dash: ["dash", "dashes"],
  }).flatMap(([unit, words]) => words.map((w) => [w, unit] as const)),
);

/** "1 1/2", "1½", "3/4", "2.5", "½" → number; null if the text doesn't start with one. */
function leadingNumber(text: string): { value: number; rest: string } | null {
  const m = text.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+)|([¼½¾⅓⅔⅛]))?(?=\s|[a-zA-Z]|$)/);
  if (!m || (!m[1] && !m[2] && !m[4])) return null;
  let value = m[1] ? Number(m[1]) : 0;
  // "1 1/2": the first number is whole and the fraction follows; "3/4" alone is just the fraction.
  if (m[2]) value = (m[1] && !text.startsWith(`${m[2]}/`) ? value : 0) + Number(m[2]) / Number(m[3]);
  if (m[4]) value += FRACTIONS[m[4]];
  if (!(value > 0)) return null;
  return { value: Math.round(value * 1000) / 1000, rest: text.slice(m[0].length).trim() };
}

/** "2 cups plain flour, sifted" → { quantity: 2, unit: "cup", name: "plain flour", notes: "sifted" } */
export function parseIngredient(line: string): Ingredient | null {
  let text = line.replace(/^\s*[-*•]\s*/, "").trim();
  if (!text) return null;
  let quantity: number | null = null;
  let unit: string | null = null;
  const n = leadingNumber(text);
  if (n) {
    quantity = n.value;
    text = n.rest;
    const word = text.match(/^([a-zA-Z]+)\.?(?=\s|$)/);
    const known = word && UNITS.get(word[1].toLowerCase());
    if (known) {
      unit = known;
      text = text.slice(word[0].length).trim();
    }
    text = text.replace(/^of\s+/i, "");
  }
  const [name, ...rest] = text.split(",");
  if (!name.trim()) return null;
  return { quantity, unit, name: name.trim(), notes: rest.join(",").trim() || null };
}

export const parseIngredients = (text: string) =>
  text.split("\n").map(parseIngredient).filter((i): i is Ingredient => i !== null);

/** The first time mentioned in a step ("simmer for 20 minutes"), in seconds, for cooking-mode timers. */
export function durationIn(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  const scale = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
  return Math.round(Number(m[1]) * scale);
}

/** One step per line; "1.", "2)" and "Step 3:" numbering is dropped. */
export const parseSteps = (text: string): Step[] =>
  text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:step\s*)?\d+\s*[.):-]\s*/i, "").trim())
    .filter(Boolean)
    .map((instruction) => ({ instruction, duration_seconds: durationIn(instruction) }));

export const parseTags = (text: string) => [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

// ---------- showing quantities ----------

const GLYPHS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

/** 1.5 → "1½", 0.333 → "⅓", 2 → "2", 1.17 → "1.17": how a cook would write it. */
export function formatQuantity(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const part = n - whole;
  if (part < 0.02) return String(whole);
  if (part > 0.98) return String(whole + 1);
  const glyph = GLYPHS.find(([v]) => Math.abs(part - v) < 0.02);
  if (glyph) return `${whole || ""}${glyph[1]}`;
  return String(Math.round(n * 100) / 100);
}

/** The quantity for a different number of servings. */
export const scaled = (quantity: number, from: number, to: number) => (quantity * to) / from;

const PLURAL: Record<string, string> = {
  cup: "cups", clove: "cloves", can: "cans", pinch: "pinches", bunch: "bunches", handful: "handfuls",
  slice: "slices", sprig: "sprigs", packet: "packets", stick: "sticks", dash: "dashes",
};

/** "cup" for one or less, "cups" for more; abbreviations (g, tbsp…) never change. */
export const unitFor = (unit: string | null, quantity: number | null) =>
  unit && quantity !== null && quantity > 1 ? (PLURAL[unit] ?? unit) : unit;

/** Back to one editable line: "1½ cups plain flour, sifted". */
export function ingredientLine(i: Ingredient): string {
  const amount = i.quantity !== null ? formatQuantity(Number(i.quantity)) : "";
  return [amount, unitFor(i.unit, i.quantity) ?? "", i.name].filter(Boolean).join(" ") + (i.notes ? `, ${i.notes}` : "");
}

/** 75 → "1 hr 15 min" */
export function minutes(total: number | null): string | null {
  if (!total) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

// ---------- browsing ----------

export type RecipeCard = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  created_at: string;
  tags: string[];
  ingredients: string[];
  /** Ids of the collections it's in. */
  collections: string[];
  /** When it was last cooked, if ever. */
  cooked_at: string | null;
  /** A signed link to its photo, if it has one. */
  photo: string | null;
};

export type Sort = "new" | "az" | "cooked";

export function findRecipes(
  all: RecipeCard[],
  { q = "", tag = null, collection = null, sort = "new" }: { q?: string; tag?: string | null; collection?: string | null; sort?: Sort },
): RecipeCard[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = all.filter((r) => {
    if (tag && !r.tags.includes(tag)) return false;
    if (collection && !r.collections.includes(collection)) return false;
    const haystack = [r.title, r.description ?? "", ...r.ingredients].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  // Recently cooked first; never-cooked ones after, newest first.
  const cooked = (r: RecipeCard) => r.cooked_at ?? "";
  return found.sort((a, b) =>
    sort === "az"
      ? a.title.localeCompare(b.title)
      : (sort === "cooked" ? cooked(b).localeCompare(cooked(a)) : 0) || b.created_at.localeCompare(a.created_at),
  );
}

// ---------- cooking-mode timers ----------

/** A countdown: running (endsAt set) or paused (left kept). Times in ms. */
export type Timer = { id: string; label: string; total: number; endsAt: number | null; left: number };

export const startTimer = (id: string, label: string, seconds: number, now: number): Timer => ({
  id,
  label,
  total: seconds * 1000,
  endsAt: now + seconds * 1000,
  left: seconds * 1000,
});

export const remaining = (t: Timer, now: number) => (t.endsAt === null ? t.left : Math.max(0, t.endsAt - now));
export const pauseTimer = (t: Timer, now: number): Timer => ({ ...t, endsAt: null, left: remaining(t, now) });
export const resumeTimer = (t: Timer, now: number): Timer => ({ ...t, endsAt: now + t.left });
export const finished = (t: Timer, now: number) => remaining(t, now) === 0;

/** 1500000 → "25:00", 3909000 → "1:05:09"; rounds up so it never shows 0:00 early. */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// ---------- importing from a recipe website ----------
// Most recipe sites describe the recipe for search engines as schema.org
// JSON-LD; reading that beats scraping each site's HTML.

export type Imported = {
  title: string;
  description: string | null;
  source_url: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
};

/** "PT1H30M" → 90 */
export function isoMinutes(value: unknown): number | null {
  const m = typeof value === "string" && value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:[\d.]+S)?)?$/i);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾", deg: "°" };

/** Text as people read it: tags dropped, entities decoded, spaces tidied. */
function plain(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (all, code: string) =>
      code[0] === "#"
        ? String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
        : (ENTITIES[code.toLowerCase()] ?? all),
    )
    .replace(/\s+/g, " ")
    .trim();
}

const isRecipe = (node: unknown): node is Record<string, unknown> => {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
};

/** The first Recipe anywhere in a JSON-LD value (arrays and @graph included). */
function findRecipe(node: unknown): Record<string, unknown> | null {
  if (isRecipe(node)) return node;
  const children = Array.isArray(node) ? node : node && typeof node === "object" ? Object.values(node) : [];
  for (const child of children) {
    const found = findRecipe(child);
    if (found) return found;
  }
  return null;
}

/** Steps come as text, a list of text, HowToSteps, or HowToSections of HowToSteps. */
function stepTexts(value: unknown): string[] {
  if (typeof value === "string") return plain(value) ? [plain(value)] : [];
  if (Array.isArray(value)) return value.flatMap(stepTexts);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.itemListElement) return stepTexts(v.itemListElement);
    return stepTexts(v.text ?? v.name);
  }
  return [];
}

/** A recipe from a web page's schema.org data, or null if it hasn't any. */
export function recipeFromPage(html: string, url: string): Imported | null {
  const blocks = html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  let recipe: Record<string, unknown> | null = null;
  for (const [, json] of blocks) {
    try {
      recipe = findRecipe(JSON.parse(json));
    } catch {
      continue;
    }
    if (recipe) break;
  }
  if (!recipe || !plain(recipe.name)) return null;
  const servings = [recipe.recipeYield].flat().map((y) => Number(String(y ?? "").match(/\d+/)?.[0])).find((n) => n >= 1 && n <= 100);
  const list = (v: unknown) => [v].flat().map(plain).filter(Boolean);
  return {
    title: plain(recipe.name).slice(0, 200),
    description: plain(recipe.description).slice(0, 500) || null,
    source_url: url,
    servings: servings ?? null,
    prep_minutes: isoMinutes(recipe.prepTime),
    cook_minutes: isoMinutes(recipe.cookTime),
    ingredients: parseIngredients(list(recipe.recipeIngredient).join("\n")),
    steps: parseSteps(stepTexts(recipe.recipeInstructions).join("\n")),
    tags: parseTags([...list(recipe.recipeCategory), ...list(recipe.recipeCuisine)].join(",")).slice(0, 5),
  };
}
