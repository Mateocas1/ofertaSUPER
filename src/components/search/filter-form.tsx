"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

import { filterHref } from "@/components/search/filter-href";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type FilterFormProps = {
  /** Path the filters apply to, e.g. "/buscar". */
  action: string;
  label: string;
  className?: string;
  children: ReactNode;
};

// A plain GET form, so the filters work without JavaScript (the "Aplicar"
// button only renders inside <noscript>). With JavaScript every change applies
// at once through a client navigation that keeps the scroll position.
export function FilterForm({ action, label, className, children }: FilterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const apply = (form: HTMLFormElement) => {
    startTransition(() => router.push(filterHref(action, new FormData(form)), { scroll: false }));
  };

  return (
    <form
      action={action}
      method="get"
      aria-label={label}
      aria-busy={isPending}
      onChange={(event) => apply(event.currentTarget)}
      onSubmit={(event) => {
        event.preventDefault();
        apply(event.currentTarget);
      }}
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}
    >
      {children}
      <noscript>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>Aplicar</button>
      </noscript>
      <span aria-live="polite" className="text-xs text-muted-foreground">{isPending ? "Actualizando…" : null}</span>
    </form>
  );
}
