import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ingredientLine } from "@/lib/galley";
import type { Recipe } from "./data";
import { LineList } from "./line-list";

export type Draft = Pick<Recipe, "title" | "description" | "source_url" | "servings" | "prep_minutes" | "cook_minutes" | "ingredients" | "steps" | "tags">;

/** The recipe form: a saved recipe, an imported one to check over, or blank. */
export function RecipeFields({ value }: { value?: Draft }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1">
        <Label htmlFor="title">Recipe</Label>
        <Input id="title" name="title" defaultValue={value?.title} placeholder="Spaghetti bolognese" required autoFocus={!value} className="h-11 text-lg" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="description">About it (optional)</Label>
        <Input id="description" name="description" defaultValue={value?.description ?? ""} placeholder="Nana's Sunday version" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="servings">Serves</Label>
          <Input id="servings" name="servings" type="number" min={1} max={100} inputMode="numeric" defaultValue={value?.servings ?? 4} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="prep_minutes">Prep (minutes)</Label>
          <Input id="prep_minutes" name="prep_minutes" type="number" min={0} inputMode="numeric" defaultValue={value?.prep_minutes ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="cook_minutes">Cook (minutes)</Label>
          <Input id="cook_minutes" name="cook_minutes" type="number" min={0} inputMode="numeric" defaultValue={value?.cook_minutes ?? ""} />
        </div>
      </div>
      <LineList
        name="ingredients"
        legend="Ingredients"
        initial={value?.ingredients.map(ingredientLine) ?? []}
        placeholder="500g beef mince"
        hint="Amount, unit, then the ingredient; anything after a comma is a note. Paste a whole list to fill it in."
      />
      <LineList
        name="steps"
        legend="Method"
        multiline
        initial={value?.steps.map((s) => s.instruction) ?? []}
        placeholder="Brown the mince in a hot pan."
        hint="Times like “30 minutes” become timers in cooking mode."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="tags">Tags (optional, comma separated)</Label>
          <Input id="tags" name="tags" defaultValue={value?.tags.join(", ")} placeholder="quick, kid-friendly" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="source_url">From (optional link)</Label>
          <Input id="source_url" name="source_url" type="url" inputMode="url" defaultValue={value?.source_url ?? ""} placeholder="https://" />
        </div>
      </div>
    </div>
  );
}
