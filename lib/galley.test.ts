import assert from "node:assert/strict";
import { test } from "node:test";
import {
  durationIn,
  clock,
  findRecipes,
  isoMinutes,
  recipeFromPage,
  type Sort,
  finished,
  pauseTimer,
  remaining,
  resumeTimer,
  startTimer,
  formatQuantity,
  ingredientLine,
  minutes,
  parseIngredient,
  parseIngredients,
  parseSteps,
  parseTags,
  scaled,
  unitFor,
} from "./galley.ts";

test("ingredient lines split into quantity, unit, name and notes", () => {
  const cases: [string, ReturnType<typeof parseIngredient>][] = [
    ["2 cups plain flour, sifted", { quantity: 2, unit: "cup", name: "plain flour", notes: "sifted" }],
    ["1 1/2 tbsp olive oil", { quantity: 1.5, unit: "tbsp", name: "olive oil", notes: null }],
    ["1½ tsp salt", { quantity: 1.5, unit: "tsp", name: "salt", notes: null }],
    ["3/4 cup milk", { quantity: 0.75, unit: "cup", name: "milk", notes: null }],
    ["½ onion, finely chopped", { quantity: 0.5, unit: null, name: "onion", notes: "finely chopped" }],
    ["500g beef mince", { quantity: 500, unit: "g", name: "beef mince", notes: null }],
    ["2 cloves garlic, crushed, or 1 tsp minced", { quantity: 2, unit: "clove", name: "garlic", notes: "crushed, or 1 tsp minced" }],
    ["1 can of chickpeas", { quantity: 1, unit: "can", name: "chickpeas", notes: null }],
    ["- 2 eggs", { quantity: 2, unit: null, name: "eggs", notes: null }],
    ["Salt and pepper, to taste", { quantity: null, unit: null, name: "Salt and pepper", notes: "to taste" }],
    ["2 large carrots", { quantity: 2, unit: null, name: "large carrots", notes: null }],
    ["   ", null],
  ];
  for (const [line, want] of cases) assert.deepEqual(parseIngredient(line), want, line);
  assert.equal(parseIngredients("2 eggs\n\n1 cup sugar\n").length, 2);
});

test("ingredients turn back into the same editable line", () => {
  for (const line of ["2 cups plain flour, sifted", "1½ tbsp olive oil", "500 g beef mince", "Salt, to taste", "⅓ cup cream", "3 cloves garlic"]) {
    assert.equal(ingredientLine(parseIngredient(line)!), line);
  }
});

test("steps: one per line, numbering dropped, times picked up", () => {
  const steps = parseSteps("1. Preheat the oven to 180C.\n\n2) Mix everything.\nStep 3: Bake for 25-30 minutes.\nRest for 1 hour before slicing");
  assert.deepEqual(steps, [
    { instruction: "Preheat the oven to 180C.", duration_seconds: null },
    { instruction: "Mix everything.", duration_seconds: null },
    { instruction: "Bake for 25-30 minutes.", duration_seconds: 1500 },
    { instruction: "Rest for 1 hour before slicing", duration_seconds: 3600 },
  ]);
  assert.equal(durationIn("Simmer 90 secs"), 90);
  assert.equal(durationIn("Cook 1.5 hrs"), 5400);
  assert.equal(durationIn("Season well"), null);
});

test("quantities show as a cook writes them, and scale", () => {
  assert.equal(formatQuantity(1.5), "1½");
  assert.equal(formatQuantity(0.333), "⅓");
  assert.equal(formatQuantity(2 / 3), "⅔");
  assert.equal(formatQuantity(0.25), "¼");
  assert.equal(formatQuantity(2), "2");
  assert.equal(formatQuantity(1.999), "2");
  assert.equal(formatQuantity(1.17), "1.17");
  // 2 cups for 4 → for 6, and ½ tsp for 4 → for 2.
  assert.equal(formatQuantity(scaled(2, 4, 6)), "3");
  assert.equal(formatQuantity(scaled(0.5, 4, 2)), "¼");
  assert.equal(formatQuantity(scaled(1, 3, 2)), "⅔");
});

test("units read naturally for the amount", () => {
  assert.equal(unitFor("cup", 2.25), "cups");
  assert.equal(unitFor("cup", 1), "cup");
  assert.equal(unitFor("cup", 0.5), "cup");
  assert.equal(unitFor("clove", 3), "cloves");
  assert.equal(unitFor("pinch", 2), "pinches");
  assert.equal(unitFor("tbsp", 2), "tbsp");
  assert.equal(unitFor("g", 500), "g");
  assert.equal(unitFor(null, 2), null);
});

test("centimetres are a unit, so a piece of ginger reads right", () => {
  assert.deepEqual(parseIngredient("5 cm piece fresh ginger, peeled"), { quantity: 5, unit: "cm", name: "piece fresh ginger", notes: "peeled" });
});

test("tags and times", () => {
  assert.deepEqual(parseTags("Quick, kid-friendly , quick,,"), ["quick", "kid-friendly"]);
  assert.equal(minutes(75), "1 hr 15 min");
  assert.equal(minutes(20), "20 min");
  assert.equal(minutes(120), "2 hr");
  assert.equal(minutes(0), null);
});

test("finding recipes by words, ingredient and tag", () => {
  const card = (title: string, created_at: string, tags: string[], ingredients: string[]) => ({
    id: title, title, description: null, servings: 4, prep_minutes: null, cook_minutes: null, created_at, tags, ingredients,
    collections: title === "Pavlova" ? ["sweets"] : [], cooked_at: title === "Pavlova" ? "2026-10-10" : title === "Egg fried rice" ? "2026-10-12" : null, photo: null,
  });
  const all = [
    card("Pavlova", "2026-10-01", ["dessert"], ["egg whites", "caster sugar"]),
    card("Spaghetti bolognese", "2026-10-03", ["quick", "kid-friendly"], ["beef mince", "spaghetti"]),
    card("Egg fried rice", "2026-10-02", ["quick"], ["rice", "eggs"]),
  ];
  const titles = (q: string, tag: string | null = null, sort: Sort = "new") => findRecipes(all, { q, tag, sort }).map((r) => r.title);
  assert.deepEqual(titles(""), ["Spaghetti bolognese", "Egg fried rice", "Pavlova"]);
  assert.deepEqual(titles("", null, "az"), ["Egg fried rice", "Pavlova", "Spaghetti bolognese"]);
  assert.deepEqual(titles("egg"), ["Egg fried rice", "Pavlova"]); // title, or an ingredient
  assert.deepEqual(titles("MINCE spag"), ["Spaghetti bolognese"]);
  assert.deepEqual(titles("", "quick"), ["Spaghetti bolognese", "Egg fried rice"]);
  assert.deepEqual(titles("pav", "quick"), []);
  assert.deepEqual(titles("", null, "cooked"), ["Egg fried rice", "Pavlova", "Spaghetti bolognese"]);
  assert.deepEqual(findRecipes(all, { collection: "sweets" }).map((r) => r.title), ["Pavlova"]);
});

test("importing a recipe from a website's schema.org data", () => {
  const page = `<html><head>
    <script type="application/ld+json">{"@type":"WebSite","name":"Taste"}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{
      "@type":["Recipe"],"name":"Anzac biscuits &amp; more","description":"<p>Crunchy &#8211; chewy</p>",
      "recipeYield":["20","20 biscuits"],"prepTime":"PT15M","cookTime":"PT1H5M",
      "recipeIngredient":["1 cup rolled oats","&frac12; cup golden syrup","125g butter, melted"],
      "recipeInstructions":[{"@type":"HowToSection","itemListElement":[
        {"@type":"HowToStep","text":"Mix the dry ingredients."},{"@type":"HowToStep","text":"Bake for 12 minutes."}]}],
      "recipeCategory":"Biscuits","recipeCuisine":["Australian"]}]}</script></head></html>`;
  const r = recipeFromPage(page, "https://example.com/anzac");
  assert.deepEqual(r && { ...r, ingredients: r.ingredients.map(ingredientLine) }, {
    title: "Anzac biscuits & more",
    description: "Crunchy – chewy",
    source_url: "https://example.com/anzac",
    servings: 20,
    prep_minutes: 15,
    cook_minutes: 65,
    ingredients: ["1 cup rolled oats", "½ cup golden syrup", "125 g butter, melted"],
    steps: [
      { instruction: "Mix the dry ingredients.", duration_seconds: null },
      { instruction: "Bake for 12 minutes.", duration_seconds: 720 },
    ],
    tags: ["biscuits", "australian"],
  });
  assert.equal(recipeFromPage("<html><body>No recipe here</body></html>", "https://example.com"), null);
  assert.equal(recipeFromPage(`<script type="application/ld+json">{not json</script>`, "https://example.com"), null);
  assert.equal(isoMinutes("PT2H"), 120);
  assert.equal(isoMinutes("P0DT0H0M"), null);
  assert.equal(isoMinutes("20 mins"), null);
});

test("cooking timers count down, pause and resume", () => {
  let t = startTimer("s3", "Bake", 1500, 0);
  assert.equal(clock(remaining(t, 0)), "25:00");
  assert.equal(clock(remaining(t, 60_000)), "24:00");
  t = pauseTimer(t, 60_000);
  // Paused: time stands still however long you wait.
  assert.equal(remaining(t, 10 * 60_000), 1_440_000);
  t = resumeTimer(t, 10 * 60_000);
  assert.equal(clock(remaining(t, 10 * 60_000 + 500)), "24:00"); // rounds up, never early
  assert.equal(finished(t, 10 * 60_000 + 1_440_000), true);
  assert.equal(remaining(t, 99 * 60 * 60_000), 0);
  assert.equal(clock(3_909_000), "1:05:09");
  assert.equal(clock(0), "0:00");
});
