import { SUPERMARKETS } from "@/lib/supermarkets";

export type FilterOption = { value: string; label: string };

type FilterSelectProps = {
  id: string;
  name: string;
  label: string;
  value: string | undefined;
  options: FilterOption[];
};

const SELECT_CLASS =
  "min-h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

// A visible label next to each control, so a narrow screen never truncates
// the meaning into "Todos los" or "Billetera o ba".
export function FilterSelect({ id, name, label, value, options }: FilterSelectProps) {
  const known = options.some((option) => option.value === value);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
      <select id={id} name={name} defaultValue={known ? value : options[0]?.value} className={SELECT_CLASS}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

export const SUPERMARKET_OPTIONS: FilterOption[] = [
  { value: "", label: "Todos" },
  ...SUPERMARKETS.map((supermarket) => ({ value: supermarket.slug, label: supermarket.name })),
];

export function SupermarketFilter({ id, value }: { id: string; value: string | undefined }) {
  return <FilterSelect id={id} name="super" label="Supermercado" value={value} options={SUPERMARKET_OPTIONS} />;
}

export function FilterCheckbox({ id, name, label, checked }: { id: string; name: string; label: string; checked: boolean }) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm text-foreground">
      <input id={id} type="checkbox" name={name} value="1" defaultChecked={checked} className="size-4 accent-primary" />
      {label}
    </label>
  );
}
