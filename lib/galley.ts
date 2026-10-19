// The Galley's text handling: ingredients and steps are typed (or pasted)
// one per line, and quantities scale with servings. Pure, so it's testable.

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

/** Back to one editable line: "1½ cup plain flour, sifted". */
export function ingredientLine(i: Ingredient): string {
  const amount = i.quantity !== null ? formatQuantity(Number(i.quantity)) : "";
  return [amount, i.unit ?? "", i.name].filter(Boolean).join(" ") + (i.notes ? `, ${i.notes}` : "");
}

/** 75 → "1 hr 15 min" */
export function minutes(total: number | null): string | null {
  if (!total) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}
