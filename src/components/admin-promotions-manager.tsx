"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type {
  AdminPromotionRecord,
  AdminPromotionStatus,
  AdminSupermarketOption,
  PromotionTypeValue,
  PromotionUpsertInput,
} from "@/lib/schemas/promotion";
import { promotionTypeOptions } from "@/lib/schemas/promotion";

type PromotionFormState = {
  supermarketId: number;
  type: PromotionTypeValue;
  title: string;
  walletProvider: string;
  bankName: string;
  discountValue: string;
  conditions: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  productEansText: string;
};

type AdminPromotionsManagerProps = {
  promotions: AdminPromotionRecord[];
  supermarkets: AdminSupermarketOption[];
  showList?: boolean;
};

const promotionStatusLabels: Record<Exclude<AdminPromotionStatus, "all">, string> = {
  active: "Activa",
  scheduled: "Programada",
  expired: "Vencida",
  inactive: "Inactiva",
};

const promotionStatusStyles: Record<Exclude<AdminPromotionStatus, "all">, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-900",
  scheduled: "border-sky-200 bg-sky-50 text-sky-900",
  expired: "border-amber-200 bg-amber-50 text-amber-900",
  inactive: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

function createEmptyForm(supermarketId: number): PromotionFormState {
  return {
    supermarketId,
    type: "wallet_discount",
    title: "",
    walletProvider: "",
    bankName: "",
    discountValue: "",
    conditions: "",
    startDate: "",
    endDate: "",
    isActive: true,
    productEansText: "",
  };
}

function createFormFromPromotion(promotion: AdminPromotionRecord): PromotionFormState {
  return {
    supermarketId: promotion.supermarketId,
    type: promotion.type,
    title: promotion.title,
    walletProvider: promotion.walletProvider ?? "",
    bankName: promotion.bankName ?? "",
    discountValue: promotion.discountValue !== null ? String(promotion.discountValue) : "",
    conditions: promotion.conditions ?? "",
    startDate: promotion.startDate ?? "",
    endDate: promotion.endDate ?? "",
    isActive: promotion.isActive,
    productEansText: promotion.productEans.join("\n"),
  };
}

function toPayload(form: PromotionFormState): PromotionUpsertInput {
  const productEans = form.productEansText
    .split(/[\n,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    supermarketId: form.supermarketId,
    type: form.type,
    title: form.title,
    walletProvider: form.walletProvider || undefined,
    bankName: form.bankName || undefined,
    discountValue: form.discountValue === "" ? undefined : Number(form.discountValue),
    conditions: form.conditions || undefined,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    isActive: form.isActive,
    productEans,
  };
}

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "No se pudo completar la operacion.";
  }

  const record = payload as {
    error?: string;
    issues?: {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
  };

  if (record.issues?.formErrors?.[0]) {
    return record.issues.formErrors[0];
  }

  if (record.issues?.fieldErrors) {
    for (const messages of Object.values(record.issues.fieldErrors)) {
      if (messages?.[0]) {
        return messages[0];
      }
    }
  }

  return record.error ?? "No se pudo completar la operacion.";
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) {
    return "Sin ventana de fechas";
  }

  if (startDate && endDate) {
    return `${startDate} -> ${endDate}`;
  }

  return startDate ? `Desde ${startDate}` : `Hasta ${endDate}`;
}

export function AdminPromotionsManager({ promotions, supermarkets, showList = true }: AdminPromotionsManagerProps) {
  const router = useRouter();
  const defaultSupermarketId = supermarkets[0]?.id ?? 0;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<PromotionFormState>(() => createEmptyForm(defaultSupermarketId));
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setEditingId(null);
    setForm(createEmptyForm(defaultSupermarketId));
  }

  function updateForm<K extends keyof PromotionFormState>(key: K, value: PromotionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleEdit(promotion: AdminPromotionRecord) {
    setFeedback(null);
    setEditingId(promotion.id);
    setForm(createFormFromPromotion(promotion));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const payload = toPayload(form);
    const isEditing = editingId !== null;
    const url = isEditing ? `/api/admin/promotions/${editingId}` : "/api/admin/promotions";
    const method = isEditing ? "PUT" : "POST";

    startTransition(() => {
      void (async () => {
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          setFeedback({ tone: "error", text: getErrorMessage(result) });
          return;
        }

        setFeedback({
          tone: "success",
          text: isEditing ? "Promocion actualizada." : "Promocion creada.",
        });
        resetForm();
        router.refresh();
      })();
    });
  }

  function handleDelete(id: number) {
    const confirmed = window.confirm("Esta accion elimina la promocion en forma permanente. Continuar?");

    if (!confirmed) {
      return;
    }

    setFeedback(null);

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/admin/promotions/${id}`, {
          method: "DELETE",
        });

        const result = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          setFeedback({ tone: "error", text: getErrorMessage(result) });
          return;
        }

        if (editingId === id) {
          resetForm();
        }

        setFeedback({ tone: "success", text: "Promocion eliminada." });
        router.refresh();
      })();
    });
  }

  return (
    <div className={cn("grid gap-6", showList && "xl:grid-cols-[0.92fr_1.08fr]")}>
      <section className="surface p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Editor</p>
            <h2 className="mt-2 text-3xl font-semibold text-foreground">
              {editingId ? "Editar promocion" : "Nueva promocion"}
            </h2>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full")}
            >
              Cancelar
            </button>
          ) : null}
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <fieldset disabled={isPending} className="space-y-5 disabled:opacity-70">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Supermercado</span>
                <select
                  value={form.supermarketId}
                  onChange={(event) => updateForm("supermarketId", Number(event.target.value))}
                  className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground"
                >
                  {supermarkets.map((supermarket) => (
                    <option key={supermarket.id} value={supermarket.id}>
                      {supermarket.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Tipo</span>
                <select
                  value={form.type}
                  onChange={(event) => updateForm("type", event.target.value as PromotionTypeValue)}
                  className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground"
                >
                  {promotionTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Titulo</span>
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Ej: MercadoPago 30% en Disco"
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Billetera</span>
                <input
                  value={form.walletProvider}
                  onChange={(event) => updateForm("walletProvider", event.target.value)}
                  className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="MercadoPago"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Banco</span>
                <input
                  value={form.bankName}
                  onChange={(event) => updateForm("bankName", event.target.value)}
                  className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="Banco Galicia"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Descuento</span>
                <input
                  value={form.discountValue}
                  onChange={(event) => updateForm("discountValue", event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="30"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Inicio</span>
                <input
                  value={form.startDate}
                  onChange={(event) => updateForm("startDate", event.target.value)}
                  type="date"
                  className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Fin</span>
                <input
                  value={form.endDate}
                  onChange={(event) => updateForm("endDate", event.target.value)}
                  type="date"
                  className="w-full rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-sm text-foreground"
                />
              </label>
            </div>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Condiciones</span>
              <textarea
                value={form.conditions}
                onChange={(event) => updateForm("conditions", event.target.value)}
                rows={4}
                className="w-full rounded-[1.5rem] border border-border/70 bg-white px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Tope, dias aplicables, medios de pago o restricciones."
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>EANs vinculados</span>
              <textarea
                value={form.productEansText}
                onChange={(event) => updateForm("productEansText", event.target.value)}
                rows={6}
                className="w-full rounded-[1.5rem] border border-border/70 bg-white px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Uno por linea o separados por coma. Si lo dejas vacio, la promo queda general para el super."
              />
            </label>

            <label className="inline-flex items-center gap-3 rounded-full border border-border/70 bg-white px-4 py-2 text-sm font-medium text-foreground">
              <input
                checked={form.isActive}
                onChange={(event) => updateForm("isActive", event.target.checked)}
                type="checkbox"
                className="size-4 rounded border-border"
              />
              Activa
            </label>

            {feedback ? (
              <p
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm",
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-rose-200 bg-rose-50 text-rose-900",
                )}
              >
                {feedback.text}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="submit" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}>
                {isPending ? "Guardando..." : editingId ? "Guardar cambios" : "Crear promocion"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full px-5")}
              >
                Limpiar
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      {showList ? (
        <section className="surface p-6 md:p-8">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Listado</p>
            <h2 className="mt-2 text-3xl font-semibold text-foreground">Promociones cargadas</h2>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Super</th>
                  <th className="px-4 py-3 font-medium">Titulo</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Ventana</th>
                  <th className="px-4 py-3 font-medium">Descuento</th>
                  <th className="px-4 py-3 font-medium">EANs</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((promotion) => (
                  <tr key={promotion.id} className="border-t border-border/60 align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{promotion.supermarket.name}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{promotion.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[promotion.walletProvider, promotion.bankName, promotion.conditions].filter(Boolean).join(" • ") ||
                          "Sin condiciones adicionales"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                          promotionStatusStyles[promotion.lifecycleStatus],
                        )}
                      >
                        {promotionStatusLabels[promotion.lifecycleStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{promotion.type}</td>
                    <td className="px-4 py-3 text-foreground">{formatDateRange(promotion.startDate, promotion.endDate)}</td>
                    <td className="px-4 py-3 text-foreground">{promotion.discountValue ?? "Sin valor"}</td>
                    <td className="px-4 py-3 text-foreground">{promotion.productEans.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(promotion)}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(promotion.id)}
                          className={cn(buttonVariants({ variant: "destructive", size: "sm" }), "rounded-full")}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {promotions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No hay promociones manuales para los filtros actuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}