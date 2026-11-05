import type { Metadata } from "next";

import { CanastaPage } from "@/components/canasta-page";

export const metadata: Metadata = {
  title: "Canasta",
  description: "Canasta local para comparar el total por supermercado con productos reales del catálogo.",
};

export default function BasketPage() {
  return (
    <div className="container-page flex flex-col gap-6 py-8 md:py-10">
      <CanastaPage />
    </div>
  );
}
