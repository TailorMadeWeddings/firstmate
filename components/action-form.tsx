"use client";

import { useState, useTransition } from "react";

/**
 * A form for a server action that returns an error message, or null when it
 * worked. Shows the error, disables the fields while saving, can ask "are
 * you sure?" first, and clears itself only when the save worked (so a typo
 * doesn't cost you everything you typed).
 */
export function ActionForm({
  action,
  confirm,
  reset = true,
  className,
  children,
}: {
  action: (prev: string | null, form: FormData) => Promise<string | null>;
  confirm?: string;
  reset?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          const problem = await action(null, data);
          setError(problem);
          if (!problem && reset) form.reset();
        });
      }}
      className={className}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && (
        <p role="alert" className="basis-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
