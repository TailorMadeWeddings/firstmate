import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { type Category } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { addCategory, deleteCategory, setArchived, updateCategory } from "../actions";
import { loadCategories } from "../shared";

export const metadata: Metadata = { title: "Categories · Ledger · First Mate" };

const DEFAULT_COLOUR = "#64748b";

export default function CategoriesPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  await currentOwner();
  const all = await loadCategories();
  const live = all.filter((c) => !c.archived_at);
  // A sub-category whose parent is archived shows at the top level.
  const isTop = (c: Category) => !live.some((p) => p.id === c.parent_category_id);
  const tops = (type: Category["type"]) => live.filter((c) => c.type === type && isTop(c));
  const children = (c: Category) => live.filter((x) => x.parent_category_id === c.id);
  const archived = all.filter((c) => c.archived_at);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex items-baseline gap-3">
        <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
          ← Ledger
        </Link>
        <h1 className="text-2xl font-bold">Categories</h1>
      </header>

      <ActionForm action={addCategory} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="cat-name">New category</Label>
          <Input id="cat-name" name="name" placeholder="Fuel" required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="cat-parent">Inside</Label>
          <NativeSelect id="cat-parent" name="parent_category_id" defaultValue="">
            <option value="">Nothing (top level)</option>
            {[...tops("expense"), ...tops("income")].map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="cat-type">Kind (top level only)</Label>
          <NativeSelect id="cat-type" name="type" defaultValue="expense">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </NativeSelect>
        </div>
        <div className="flex items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="cat-colour">Colour</Label>
            <Input id="cat-colour" name="color" type="color" defaultValue={DEFAULT_COLOUR} className="w-14 p-1" />
          </div>
          <div className="grid flex-1 gap-1">
            <Label htmlFor="cat-icon">Icon</Label>
            <Input id="cat-icon" name="icon" placeholder="⛽" maxLength={4} />
          </div>
        </div>
        <Button className="justify-self-start">Add category</Button>
      </ActionForm>

      {(["expense", "income"] as const).map((type) => (
        <section key={type} className="flex flex-col gap-2">
          <h2 className="font-semibold">{type === "expense" ? "Expenses" : "Income"}</h2>
          <ul className="divide-y rounded-xl border">
            {tops(type).map((c) => (
              <li key={c.id}>
                <Row category={c} />
                {children(c).length > 0 && (
                  <ul className="divide-y border-t pl-6">
                    {children(c).map((child) => (
                      <li key={child.id}>
                        <Row category={child} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Archived</h2>
          <p className="text-sm text-muted-foreground">
            Hidden from new transactions, still shown on old ones.
          </p>
          <ul className="divide-y rounded-xl border">
            {archived.map((c) => (
              <li key={c.id}>
                <Row category={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ category: c }: { category: Category }) {
  return (
    <details className="px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: c.color ?? DEFAULT_COLOUR }}
          aria-hidden
        />
        {c.icon && <span aria-hidden>{c.icon}</span>}
        <span className="flex-1">{c.name}</span>
        <span className="text-xs text-muted-foreground">Edit</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <ActionForm action={updateCategory.bind(null, c.id)} reset={false} className="flex flex-wrap items-end gap-3">
          <div className="grid flex-1 gap-1">
            <Label htmlFor={`name-${c.id}`}>Name</Label>
            <Input id={`name-${c.id}`} name="name" defaultValue={c.name} required />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`colour-${c.id}`}>Colour</Label>
            <Input
              id={`colour-${c.id}`}
              name="color"
              type="color"
              defaultValue={c.color ?? DEFAULT_COLOUR}
              className="w-14 p-1"
            />
          </div>
          <div className="grid w-20 gap-1">
            <Label htmlFor={`icon-${c.id}`}>Icon</Label>
            <Input id={`icon-${c.id}`} name="icon" defaultValue={c.icon ?? ""} maxLength={4} />
          </div>
          <Button variant="secondary">Save</Button>
        </ActionForm>
        <div className="flex flex-wrap gap-2">
          <ActionForm action={setArchived.bind(null, c.id, !c.archived_at)}>
            <Button variant="outline" size="sm">
              {c.archived_at ? "Restore" : "Archive"}
            </Button>
          </ActionForm>
          <ActionForm action={deleteCategory.bind(null, c.id)} confirm={`Delete ${c.name}?`}>
            <Button variant="outline" size="sm" className="text-red-600">
              Delete
            </Button>
          </ActionForm>
        </div>
      </div>
    </details>
  );
}
