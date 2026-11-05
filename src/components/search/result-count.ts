const countFormatter = new Intl.NumberFormat("es-AR");

/** "2.656 productos · mostramos los primeros 24", "3 productos", "1 producto". */
export function resultCountLabel(total: number, shown: number): string {
  const base = `${countFormatter.format(total)} ${total === 1 ? "producto" : "productos"}`;
  return shown > 0 && shown < total ? `${base} · mostramos los primeros ${shown}` : base;
}
