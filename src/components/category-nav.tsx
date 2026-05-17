import Link from "next/link";
import { Apple, Beef, Milk, PackageSearch, Sandwich, Sparkles, SprayCan, WavesLadder } from "lucide-react";

type CategoryItem = {
  name: string;
  slug: string;
  count: number;
  icon: string | null;
};

const iconMap = {
  almacen: PackageSearch,
  bebidas: WavesLadder,
  lacteos: Milk,
  carnes: Beef,
  "frutas-verduras": Apple,
  limpieza: SprayCan,
  "desayuno-merienda": Sandwich,
};

export function CategoryNav({ categories }: { categories: CategoryItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {categories.map((category) => {
        const Icon = iconMap[category.slug as keyof typeof iconMap] ?? Sparkles;

        return (
          <Link
            key={category.slug}
            href={`/categoria/${category.slug}`}
            className="surface-soft group flex items-center justify-between gap-4 px-5 py-4 transition-transform duration-200 hover:-translate-y-1"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-foreground">{category.name}</p>
                <p className="text-sm text-muted-foreground">{category.count} productos</p>
              </div>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Ver</span>
          </Link>
        );
      })}
    </div>
  );
}