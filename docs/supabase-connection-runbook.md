# Supabase connection runbook

Este runbook existe para destrabar la ingesta DB-backed sin mezclarlo con VTEX. El probe VTEX para Disco ya respondió sano; el bloqueo actual está en las connection strings de Supabase.

## Quick path si vuelve a fallar

1. Abrir el proyecto Supabase activo que corresponde a `ofertasSUPER`.
2. Copiar connection strings frescos:
   - `DATABASE_URL`: pooler/session o transaction pooler recomendado por Supabase para runtime.
   - `DIRECT_URL`: conexión directa para Prisma migrations/admin.
3. Actualizar solo estos destinos:
   - `.env`
   - `.env.local`
   - GitHub secrets `DATABASE_URL` y `DIRECT_URL`
4. Reintentar:

```bash
# ejemplo acotado si hay que revalidar
$env:INGESTION_V2="shadow"
npm run ingest -- --source=disco --limit=1
```

## Evidencia del bloqueo y recuperacion

| Check | Resultado |
|---|---|
| VTEX all-source probes | Disco, Jumbo, Carrefour, Vea, DIA y MAS devolvieron `isHealthy=true`, `hashValid=true`, `productsReturned=3` por fuente |
| Prisma ingest dry-run | Recuperado despues de reanudar Supabase: Disco dry-run exit 0, multi-fuente dry-run exit 0 |
| Error DB anterior | `FATAL: (ENOTFOUND) tenant/user postgres.<project-ref> not found` |
| DNS pooler regional | `aws-1-sa-east-1.pooler.supabase.com` resuelve |
| DNS host directo | Ahora resuelve despues de reanudar Supabase |

Interpretación defendible: el problema no es el hash VTEX. Es un project ref/tenant/usuario de Supabase inválido, viejo, pausado o eliminado.

## Qué revisar en Supabase

- El project ref activo debe coincidir entre pooler user y host directo.
- Si el project ref cambió, no parches solo una URL: actualizá `DATABASE_URL` y `DIRECT_URL` juntas.
- Si el proyecto está pausado o eliminado, restaurarlo o crear uno nuevo y correr migraciones/seeds antes de reintentar ingesta.
- Si Supabase cambió el formato recomendado del pooler, usar el formato actual del dashboard, no el string viejo guardado en `.env`.

## Checklist de cierre

- [x] Supabase reanudado para la validacion local actual.
- [x] DNS del host directo resuelve despues de reanudar Supabase.
- [ ] GitHub secrets actualizados.
- [ ] `npm run ingest -- --dry-run --source=disco --limit=1` sale con código `0`.
- [x] La salida muestra fuente sana y conteos fetch/staging: Disco `fetched=6`, `staged=6`, `failedSources=0`.
- [x] `docs/production-readiness-vtex.md` actualizado con la nueva evidencia.

## Claim permitido ahora

> El proyecto tiene ingesta VTEX/SHA256 implementada, probes VTEX sanos para todas las fuentes configuradas, dry-run DB-backed recuperado y `source_health` verificado en modo `shadow`. No implica ingesta productiva activa ni deploy cerrado.
