# ofertasSUPER UI spec - Canasta inteligente

Estado: direccion visual aprobada como base, pendiente de implementacion fiel.

Referencia visual aceptada:

- `docs/design/canasta-inteligente-preview-2026-05-16.png`
- Original generado: `C:\Users\picala\.codex\generated_images\019e247c-dcc4-7760-a3a4-e5c6cb5f0fcd\ig_00f7caad1b7628b1016a08e9083d548193afb500ed12dffc1d.png`

## Concepto

**Canasta inteligente con datos progresivos.**

La app debe sentirse simple para usuarios comunes y solida para lectura tecnica:

> Una herramienta simple para ahorrar, con una maquina de datos atras.

No es un ecommerce generico. Es un comparador para buscar productos, comparar supermercados y resolver la canasta con mejor precio/cobertura.

## Principios de diseno

- Busqueda primero; datos despues.
- La canasta inteligente es la firma visual.
- Datos tecnicos traducidos a lenguaje humano.
- Price Ops en segunda lectura, no como cockpit abrumador.
- Sin hero centrado generico.
- Sin grilla de tres cards iguales.
- Sin estetica violeta/neon de template AI.
- Sin emojis en UI.

## Paleta

| Rol | Direccion |
| --- | --- |
| Fondo | off-white/zinc claro, premium y limpio |
| Superficie | blanco con borde zinc suave |
| Texto principal | carbon/off-black, nunca negro puro |
| Texto secundario | zinc/slate |
| Acento principal | emerald/oliva sobrio |
| Acento funcional | amber suave solo para faltantes/advertencias |

Regla: verde manda. Amber solo informa, no compite.

## Tipografia

- Sans premium: Geist/Satoshi/Cabinet-like.
- Precios, horarios y pequenos datos numericos pueden usar mono.
- H1 fuerte, no gritón.
- Labels operativos pequenos y sobrios.
- Nada de copy inflado.

## Header

Elementos:

- Marca `ofertasSUPER` con monograma OS simple.
- Nav: `Inicio`, `Buscar`, `Ofertas`, `Canasta`.
- Accion: `Ver canasta`.

Reglas:

- Header limpio, sin exceso de iconos.
- Estado activo con subrayado/linea emerald.
- No meter buscador en header en la home; el buscador vive en el hero.

## Home hero

Layout: split asimetrico.

### Columna izquierda

Copy aceptada:

- H1: `Compará precios. Armá tu canasta. Comprá mejor.`
- Body: `Buscá productos de supermercados argentinos, compará precios por EAN y descubrí dónde conviene resolver tu compra.`
- Placeholder: `Buscar leche, yerba, arroz, aceite...`
- CTA: `Buscar`
- Chips: `leche`, `yerba`, `arroz`, `aceite`

Senales permitidas:

- `6 fuentes configuradas`
- `EAN normalizado` o variante mas humana: `Productos comparables por código`
- `Frescura visible`

No agregar mas metricas arriba del fold sin nueva aprobacion.

### Columna derecha

Panel firma: `Canasta inteligente`.

Debe mostrar:

- lista compacta de productos;
- ranking de supermercados;
- total por supermercado;
- cobertura tipo `4/4 productos`;
- estado humano: `Completa`, `Falta 1`;
- destacado: `Mejor canasta completa`.

Regla clave:

> El panel debe entenderse en 3 segundos. Si parece dashboard tecnico, esta mal.

## Resultados de producto

Patron: fila rica, no card ecommerce.

Columnas/datos:

- producto + imagen;
- precio minimo;
- supermercado mas barato;
- rango de precios;
- ultima actualizacion;
- accion `Agregar`.

Copy:

- `Precios por producto`
- `Mostrando 4 de 4 productos`
- `Ver todos los productos`

## Lecturas del catálogo

Rol: capa secundaria.

Usar para:

- movimientos de precio;
- rango amplio;
- estabilidad;
- oportunidades.

No debe competir con el buscador ni con la canasta.

Ejemplos:

- `Yerba bajó 7.4%`
- `Aceite con rango amplio`
- `Leche estable`

## Componentes base

- `SearchCommand`
- `QuickSearchChips`
- `SourceSignal`
- `SmartBasketPanel`
- `BasketProductList`
- `SupermarketRankingTable`
- `ProductResultRow`
- `MarketPulseList`
- `SupermarketBadge`
- `CoverageMeter`
- `SkeletonRow`
- `InlineError`
- `EmptyState`

## Estados obligatorios

Cada flujo debe contemplar:

- loading con skeleton de filas/panel;
- empty state;
- error inline;
- producto sin precio;
- supermercado con cobertura parcial;
- canasta vacia;
- fuente no disponible/sin verificar.

## Motion

Permitido:

- cascada suave de entrada;
- hover/active tactil;
- transiciones de ranking;
- shimmer sutil en skeletons;
- drawer/panel de canasta fluido.

Evitar:

- parallax fuerte;
- glows;
- animacion infinita innecesaria;
- efectos que tapen la funcion.

## Responsive

- Desktop: split hero y panel amplio.
- Mobile: una columna estricta.
- Mobile order:
  1. header;
  2. H1 + search;
  3. senales;
  4. canasta inteligente compacta;
  5. resultados;
  6. lecturas del catálogo.

No usar `h-screen`; si hay secciones altas, usar `min-h-[100dvh]`.

## Desviaciones permitidas al implementar

- Usar productos reales de la DB en vez de mockups generados.
- Usar badges tipograficos propios si no hay logos limpios.
- Cambiar `EAN normalizado` por `Productos comparables por código` si reduce friccion para usuarios comunes.
- Mover `Lecturas del catálogo` mas abajo si el primer viewport queda cargado.

## Siguiente slice recomendado

Implementar solo el primer slice visual:

1. tokens globales;
2. header;
3. home hero;
4. panel de canasta inteligente;
5. preview de filas de producto;
6. mercado vivo liviano.

No implementar detalle producto/canasta profunda hasta que la home tenga fidelidad visual alta contra la referencia aceptada.
