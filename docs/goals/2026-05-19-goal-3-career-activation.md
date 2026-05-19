# Goal 3 - Career activation system para conseguir entrevistas

> Uso recomendado: Desktop App con `$chrome` y `effort=high`. Usar CLI solo para editar archivos/tracker. No publicar ni enviar mensajes sin aprobación puntual.

```text
/goal Ejecutar un sistema de activación laboral para maximizar chances reales de conseguir entrevistas y entrar al sector IT/software/developer usando ofertasSUPER como prueba principal, con LinkedIn, networking, tracker de ofertas, match >75% y seguimiento semanal.

Contexto:
- Perfil objetivo: entrada/junior/trainee full-stack, honesto y defendible.
- Proyecto principal: ofertasSUPER.
- Demo: https://ofertas-super.vercel.app.
- Repo: https://github.com/Mateocas1/ofertaSUPER.
- Portfolio/CV/assets están preparados, pero cualquier cambio externo en LinkedIn/GitHub requiere aprobación explícita.
- Chrome/Desktop App es preferible para LinkedIn live porque requiere sesión autenticada.

Objetivo:
Construir y ejecutar un sistema medible de publicaciones, networking y aplicaciones para aumentar entrevistas, sin spam, sin claims inflados y con adaptación real por oferta.

Contrato estricto:
- No publicar posts sin mostrar texto final y recibir aprobación explícita.
- No mandar conexiones sin aprobación del lote/mensaje si se usa navegador autenticado.
- No aplicar a ofertas sin revisar match real y adaptar mensaje/CV si corresponde.
- No inventar experiencia formal IT, seniority, usuarios, métricas o producción cerrada.
- No vender ofertasSUPER como production-ready.
- Cada acción debe quedar registrada en tracker.
- Priorizar calidad de contacto sobre volumen bruto.
- Guardar en Engram aprendizajes de estrategia, copy que funciona y decisiones.

Arquitectura del sistema laboral:
1. Asset base: CV, portfolio, GitHub profile, LinkedIn profile.
2. Contenido: posts que demuestran criterio técnico y aprendizaje.
3. Networking: conexiones cuidadas con perfiles relevantes.
4. Ofertas: scoring >75%, adaptación y aplicación.
5. Seguimiento: métricas semanales y ajustes.

Métricas principales:
- Conexiones cuidadas enviadas por día.
- % aceptación conexión.
- Respuestas recibidas.
- Ofertas evaluadas.
- Ofertas aplicadas con match >75%.
- Entrevistas o contactos concretos.
- Posts publicados y engagement cualitativo.

Gates:

Gate 0 - Baseline live:
- Verificar con Chrome/Desktop App el estado actual de LinkedIn y GitHub si el bridge funciona.
- Verificar que CV/portfolio/GitHub links apuntan a ofertasSUPER.
- Si Chrome no funciona, trabajar desde assets locales y marcar LinkedIn live como no verificado.

Gate 1 - Primer post LinkedIn:
- Preparar post de lanzamiento honesto.
- Debe incluir: formación, foco full-stack, ofertasSUPER como proyecto, aprendizaje técnico, CTA profesional.
- Prohibido: production-ready, senior, métricas inventadas.
- Output: 2 versiones, una humana y una más técnica.
- Publicar solo con aprobación explícita.

Gate 2 - Serie técnica:
- Idear 4-6 posts derivados de evidencia real:
  - RLS/Supabase y seguridad honesta.
  - Vercel smoke y límites de producción.
  - Fail-open Redis/cache/rate limit.
  - Ingesta VTEX/SHA256.
  - Auditoría técnica y deuda priorizada.
  - Cómo uso IA como herramienta, no como reemplazo de criterio.
- Cada post debe tener claim seguro y evidencia.

Gate 3 - Networking cuidadoso:
- Definir perfiles objetivo:
  - recruiters IT;
  - talent acquisition tech;
  - devs frontend/backend/full-stack;
  - tech leads con señales de mentoring;
  - founders/startups chicas;
  - alumni UTN;
  - comunidades junior confiables.
- Crear mensajes por tipo de perfil.
- Límite sugerido: 5-10 conexiones/día, personalizadas, no spam.
- Registrar en tracker.

Gate 4 - Tracker de ofertas y match >75%:
- Crear o actualizar tracker con columnas:
  - fecha;
  - empresa;
  - rol;
  - link;
  - seniority pedido;
  - stack match;
  - dominio match;
  - modalidad;
  - idioma;
  - must-have blockers;
  - score total;
  - decisión;
  - mensaje adaptado;
  - estado;
  - follow-up date.
- Scoring mínimo:
  - stack 30;
  - seniority 20;
  - dominio/producto 15;
  - ubicación/modalidad 10;
  - formación/proyectos demostrables 15;
  - señales culturales/aprendizaje 10.
- Aplicar solo si score >=75 o si hay razón estratégica documentada.

Gate 5 - Aplicación adaptada:
- Para cada oferta >=75:
  - adaptar mensaje breve;
  - elegir bullets del CV/proyecto relevantes;
  - registrar qué evidencia usar;
  - aplicar o dejar listo para aprobación.
- No enviar datos sensibles ni formularios externos sin aprobación cuando corresponda.

Gate 6 - Revisión semanal:
- Revisar métricas.
- Identificar qué mensajes/posts generan respuesta.
- Ajustar target y copy.
- Documentar aprendizajes.

Output obligatorio:
- `career/tracker/job-matching-tracker-YYYY-MM-DD.csv` o actualizar tracker existente.
- `career/linkedin/posts-YYYY-MM-DD.md`
- `career/networking/messages-YYYY-MM-DD.md`
- `career/weekly-review-YYYY-MM-DD.md`
- Si se prefiere mantener todo en la carpeta actual de career assets, usar `C:\Users\picala\Documents\Codex\2026-05-07\files-mentioned-by-the-user-whatsapp` y registrar en handoff.

Criterio de éxito:
- Perfil y assets alineados con ofertasSUPER.
- Primer post listo o publicado con aprobación.
- Sistema de networking operativo.
- Tracker con scoring >75 funcional.
- Primer lote de ofertas evaluado con decisiones claras.
- Ningún claim inflado.
- Próxima semana puede continuar con métricas, no desde cero.
```
