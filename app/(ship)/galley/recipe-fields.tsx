import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ingredientLine } from "@/lib/galley";
import type { Recipe } from "./data";

const area =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

/**
 * The recipe form. Ingredients and steps are one per line: quick to type,
 * easy to paste from anywhere, and reordering is just moving a line.
 */
export function RecipeFields({ value }: { value?: Recipe }) {
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
      <div className="grid gap-1">
        <Label htmlFor="ingredients">Ingredients, one per line</Label>
        <textarea
          id="ingredients"
          name="ingredients"
          rows={8}
          defaultValue={value?.ingredients.map(ingredientLine).join("\n")}
          placeholder={"500g beef mince\n1 onion, finely chopped\n2 cloves garlic, crushed\n1½ cups passata"}
          className={area}
        />
        <p className="text-xs text-muted-foreground">Amount, unit, then the ingredient; anything after a comma is a note.</p>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="steps">Method, one step per line</Label>
        <textarea
          id="steps"
          name="steps"
          rows={8}
          defaultValue={value?.steps.map((s) => s.instruction).join("\n")}
          placeholder={"Brown the mince in a hot pan.\nAdd the onion and garlic; cook for 5 minutes.\nSimmer with the passata for 30 minutes."}
          className={area}
        />
        <p className="text-xs text-muted-foreground">Times like &ldquo;30 minutes&rdquo; become timers in cooking mode.</p>
      </div>
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
