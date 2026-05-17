import type { Metadata } from "next";

import { CanastaPage } from "@/components/canasta-page";

export const metadata: Metadata = {
  title: "Canasta",
  description: "Canasta local para comparar el total por supermercado con productos reales del catalogo.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function BasketPage() {
  return (
    <div className="px-6 py-8 md:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <CanastaPage />
      </div>
    </div>
  );
}