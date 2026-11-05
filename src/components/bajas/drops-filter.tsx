"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DropFilterRow = { id: string; category: string | null; node: ReactNode };
export type DropFilterCategory = { name: string; count: number };

const ALL = "__all__";

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-accent font-semibold text-accent-foreground"
          : "border-border bg-card text-foreground hover:border-primary/50",
      )}
    >
      {label}
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

// The rows are rendered on the server (the page stays static); this component
// only hides the ones outside the chosen category, so no request is made.
export function DropsFilter({ rows, categories }: { rows: DropFilterRow[]; categories: DropFilterCategory[] }) {
  const [selected, setSelected] = useState(ALL);
  const visible = selected === ALL ? rows : rows.filter((row) => (row.category ?? "Sin categoría") === selected);

  return (
    <div>
      <div role="group" aria-label="Filtrar por categoría" className="flex flex-wrap gap-2">
        <Chip active={selected === ALL} onClick={() => setSelected(ALL)} label="Todas" count={rows.length} />
        {categories.map((category) => (
          <Chip
            key={category.name}
            active={selected === category.name}
            onClick={() => setSelected(category.name)}
            label={category.name}
            count={category.count}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground" role="status">
        {visible.length === 1 ? "1 baja" : `${visible.length} bajas`}
        {selected === ALL ? "" : ` en ${selected}`}
      </p>
      <ul className="surface mt-2 divide-y divide-border">
        {visible.map((row) => (
          <li key={row.id} className="relative">
            {row.node}
          </li>
        ))}
      </ul>
    </div>
  );
}
