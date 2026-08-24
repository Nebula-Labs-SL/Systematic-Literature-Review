# SLR NébulaLabs — Guía de aprendizaje completa

> Escrita como si fuera un profesor explicando cada decisión técnica desde cero.  
> Para un desarrollador que está aprendiendo mientras construye.

---

## Índice

1. [¿Qué estamos construyendo y por qué?](#1-qué-estamos-construyendo-y-por-qué)
2. [La arquitectura general — el mapa del sistema](#2-la-arquitectura-general)
3. [Node.js y Express — el servidor que responde preguntas](#3-nodejs-y-express)
4. [BullMQ y Redis — la sala de espera del trabajo pesado](#4-bullmq-y-redis)
5. [Supabase — la base de datos que vive en la nube](#5-supabase)
6. [Claude / Anthropic — el cerebro del sistema](#6-claude--anthropic)
7. [React y Vite — la interfaz que ve el usuario](#7-react-y-vite)
8. [El pipeline completo paso a paso](#8-el-pipeline-completo)
9. [Server-Sent Events — los logs en tiempo real](#9-server-sent-events)
10. [PRISMA 2020 — la metodología científica detrás](#10-prisma-2020)
11. [DARE — cómo medimos la calidad de un estudio](#11-dare)
12. [Los bugs que encontramos y qué aprendimos](#12-los-bugs-que-encontramos)
13. [Riesgos, limitaciones y qué mejoraría un profesional](#13-riesgos-y-limitaciones)

---

## 1. ¿Qué estamos construyendo y por qué?

### El problema que resolvemos

Una **Revisión Sistemática de Literatura (SLR)** es el proceso científico formal de buscar, filtrar y analizar todos los estudios publicados sobre un tema. Un investigador que hace una SLR de forma manual tiene que:

1. Buscar en 4-6 bases de datos académicas con strings de búsqueda complejos
2. Leer el título y abstract de cientos o miles de papers para decidir cuáles son relevantes
3. Leer los papers completos de los que pasaron el filtro inicial
4. Evaluar la calidad metodológica de cada uno
5. Extraer datos estructurados para la síntesis

Esto puede tardar **6-18 meses** y es el cuello de botella más grande de la investigación doctoral.

### Lo que hace nuestro sistema

NébulaLabs automatiza cada uno de esos pasos usando **IA**. En lugar de que tú leas 380 abstracts uno a uno, Claude los lee todos en 20 minutos y te devuelve los 40 más relevantes para revisión humana.

```
Sin automatización:  6-18 meses de trabajo manual
Con NébulaLabs:      ~2 horas de proceso + 1-2 horas de revisión humana
```

### Ventajas reales

- **Reproducibilidad**: el proceso queda registrado exactamente en la base de datos. Otro investigador puede auditar cada decisión.
- **Escala**: puedes procesar 5.000 papers donde un humano procesaría 100.
- **Consistencia**: Claude aplica los mismos criterios al paper número 1 y al número 380. Un humano se cansa.

### Riesgo principal

La IA puede **alucinar** — inventar razones para incluir o excluir papers que no se justifican con el texto. Por eso existe el componente HITL (Human-In-The-Loop): los papers con baja confianza van a revisión humana obligatoria.

---

## 2. La arquitectura general

Antes de entrar en detalle, necesitas ver el mapa completo. Un sistema de software no es una sola pieza: son varias piezas que se comunican.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO (navegador)                     │
│                    React + Vite (puerto 5173)                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │  HTTP (peticiones y respuestas)
                                │  SSE  (logs en tiempo real)
┌───────────────────────────────▼─────────────────────────────────┐
│                    SERVIDOR API (Node.js + Express)             │
│                          puerto 3000                            │
│                                                                 │
│   Router de Express → Endpoints → Lógica de negocio            │
└────────────┬──────────────────────────────┬─────────────────────┘
             │                              │
    ┌────────▼────────┐           ┌────────▼────────┐
    │   BullMQ Queue  │           │    Supabase      │
    │   (Redis)       │           │    (PostgreSQL)  │
    │                 │           │                  │
    │  slr-search     │           │  runs            │
    │  slr-processing │           │  studies         │
    └────────┬────────┘           │  screening_dec.  │
             │                   │  dare_scores     │
    ┌────────▼────────┐           │  extractions     │
    │    Workers      │           └──────────────────┘
    │  (procesos que  │
    │  consumen cola) │                    ▲
    │                 │                   │
    │  SearchWorker   │         ┌──────────┴──────────┐
    │  ProcessWorker  ├────────►│  Agentes de IA      │
    └─────────────────┘         │  (llaman a Claude)  │
                                │                     │
                                │  SearchAgent        │
                                │  ScreeningAgent     │
                                │  RetrievalAgent     │
                                │  Stage2Agent        │
                                │  DAREAgent          │
                                │  ExtractionAgent    │
                                └─────────────────────┘
```

**Analogía**: piensa en un restaurante.
- El **cliente** (React) hace el pedido.
- El **camarero** (Express) toma el pedido y lo lleva a cocina.
- La **comanda** (BullMQ/Redis) es el ticket que no se pierde aunque la cocina esté ocupada.
- Los **cocineros** (Workers) preparan los platos en paralelo.
- Los **platos** son los agentes de IA que hacen el trabajo real.
- La **base de datos** (Supabase) es el almacén donde está todo guardado.

---

## 3. Node.js y Express

### ¿Qué es Node.js?

Node.js es un **entorno de ejecución de JavaScript** fuera del navegador. Antes de Node.js (2009), JavaScript solo existía en el navegador. Node.js permite usar el mismo lenguaje en el servidor.

**¿Por qué JavaScript en el servidor?**
- Un solo lenguaje para frontend y backend (menos cambio de contexto mental)
- **Muy eficiente con operaciones de I/O** (network, disco): Node usa un modelo de ejecución asíncrono que no bloquea mientras espera respuestas
- Enorme ecosistema de paquetes (npm)

**¿Qué significa asíncrono?**

```javascript
// Sincrónico (bloqueante) — como en Python sin async:
const datos = leerBaseDatos()   // el programa se PARA aquí hasta tener respuesta
const moreData = otraConsulta() // esto no empieza hasta que la anterior termina

// Asíncrono — cómo funciona Node:
const [datos, moreData] = await Promise.all([
  leerBaseDatos(),   // estas dos consultas se lanzan
  otraConsulta()     // en PARALELO, no una tras otra
])
```

En nuestro proyecto, cuando el servidor recibe una petición para ver las stats de un run, hace 3 consultas a Supabase en paralelo. Eso es 3 veces más rápido que hacerlas en secuencia.

### ¿Qué es Express?

Express es el framework más popular para crear APIs en Node.js. Una **API** (Application Programming Interface) es un conjunto de "puertas" que tu servidor expone al mundo. Cada puerta tiene una dirección (URL) y responde a un tipo de acción (GET, POST, DELETE).

```javascript
// Esto define UNA puerta:
router.get('/runs/:id', async (req, res) => {
  // req = lo que llegó (parámetros, body, headers)
  // res = lo que vas a responder
  const { data } = await supabase.from('runs').eq('id', req.params.id)
  res.json(data)
})
```

**Analogía**: Express es como el índice de un libro. Sin él, el servidor no sabría qué hacer cuando llega una petición a `/api/runs/123` vs `/api/runs/123/papers`.

### ¿Por qué separamos router de app?

```javascript
const app    = express()
const router = express.Router()

// Todo el código va en router
router.get('/runs', ...)
router.post('/runs/create', ...)

// Al final, montamos todo bajo /api
app.use('/api', router)
```

Esto significa que todas nuestras rutas quedan bajo `/api/...`. Ventaja: si mañana añades archivos estáticos, no colisionan con la API. Es una convención de organización.

---

## 4. BullMQ y Redis

Esta es probablemente la parte más importante de entender, porque fue también la fuente del bug principal.

### El problema sin colas

Imagina que el usuario hace clic en "Buscar papers". El servidor tiene que:
1. Buscar en OpenAlex (puede tardar 30 segundos)
2. Buscar en arXiv (puede tardar 30 segundos)
3. Buscar en IEEE (puede tardar 30 segundos)
4. Buscar en Crossref (puede tardar 30 segundos)
5. Deduplicar 2.000 resultados
6. Llamar a Claude 380 veces (puede tardar 10 minutos)

Total: 15+ minutos. HTTP tiene un **timeout** por defecto de 30-60 segundos. La conexión se cerraría antes de terminar.

Además: si el servidor se reinicia a mitad del proceso, ¿qué pasa? Se pierde todo.

### La solución: colas de trabajo

Una **cola** (queue) es una lista de tareas pendientes que persiste en Redis. Funciona así:

```
SERVIDOR                          REDIS (cola)                    WORKER
    │                                 │                              │
    │──── añadir tarea "search" ─────►│                              │
    │◄─── "ok, job ID: 42" ──────────│                              │
    │                                 │◄─────── pedir trabajo ───────│
    │ (servidor responde al           │──── entregar job 42 ────────►│
    │  cliente en < 1 segundo)        │                              │ (procesa
    │                                 │                              │  durante
    │                                 │◄──── "job 42 completo" ──────│  10 minutos)
```

El servidor responde al cliente inmediatamente con `{ ok: true, jobId: 42 }`. El cliente puede consultar el progreso con otro endpoint: `GET /runs/:id/job-progress`.

### ¿Qué es Redis?

Redis es una base de datos **en memoria** (RAM). Es extremadamente rápida (microsegundos vs milisegundos de PostgreSQL) pero los datos desaparecen si el servidor se apaga (en configuración básica).

Se usa perfectamente para:
- Colas de trabajo (BullMQ)
- Caché temporal
- Sesiones de usuario

**No** se usa para datos permanentes (eso es Supabase).

### BullMQ — la librería de colas

BullMQ es la librería que gestiona Redis como cola de trabajo. Tiene dos conceptos principales:

**Queue** (cola): el productor. Añade trabajos a la lista.
```javascript
const job = await searchQueue.add('search', {
  topic: 'quantum computing',
  strings: ['("LLM") AND ("quantum")'],
  runId: '123-abc'
})
```

**Worker** (trabajador): el consumidor. Lee de la lista y ejecuta.
```javascript
const worker = new Worker('slr-search', async (job) => {
  await runSearchAgent(job.data.topic, job.data.strings, ...)
  // Cuando esta función termina, BullMQ marca el job como 'completed'
})
```

### El bug de la conexión compartida — y por qué importa

Este fue el bug más difícil del proyecto. Cuando el Worker usa la misma conexión Redis que la Queue, ocurre esto:

```
Redis connection (compartida)
    │
    ├── Queue: "dame conexión para añadir job"
    │   Redis: "ok, aquí tienes"
    │
    └── Worker: usa BLPOP (comando BLOQUEANTE)
        "espera aquí BLOQUEADO hasta que llegue trabajo"
        ← desde este momento, la conexión está BLOQUEADA
        ← la Queue no puede añadir más jobs
        ← el Worker nunca recibe los jobs nuevos
        ← DEADLOCK
```

La solución es simple pero no obvia: **cada Worker necesita su propia conexión**.

```javascript
// redis-client.js
export const redis = new Redis(REDIS_URL)           // para Queue
export const redisWorker = new Redis(REDIS_URL)     // para SearchWorker
export const redisProcessing = new Redis(REDIS_URL) // para ProcessingWorker
```

Tres conexiones TCP separadas a Redis. Cada una hace su trabajo sin interferir.

**Analogía**: es como tener dos teléfonos en lugar de uno. Si el primero está en una llamada larga (BLPOP bloqueante), el segundo puede recibir llamadas nuevas.

### Reintentos y backoff exponencial

```javascript
defaultJobOptions: {
  attempts: 3,          // si falla, reintenta hasta 3 veces
  backoff: {
    type: 'exponential',
    delay: 5000         // 5s, 10s, 20s entre intentos
  }
}
```

**Backoff exponencial**: si un job falla, espera 5 segundos antes de reintentar. Si vuelve a fallar, espera 10 segundos. Si falla otra vez, 20 segundos. Esto evita saturar un servicio externo que está caído temporalmente.

**Riesgo**: si usas `attempts: 3` y el servidor se reinicia 3 veces durante el proceso, el job queda en estado `failed` para siempre. La solución: usar `npm start` en producción, no `node --watch`.

---

## 5. Supabase

### ¿Qué es Supabase?

Supabase es un **BaaS** (Backend as a Service): te da una base de datos PostgreSQL completa en la nube, con API REST y SDK de JavaScript generados automáticamente. Sin tener que instalar PostgreSQL, sin configurar servidores de base de datos.

**PostgreSQL** es el sistema de base de datos relacional más avanzado del mundo open source. Una base de datos relacional organiza los datos en **tablas** conectadas por **relaciones**.

### Nuestro esquema de tablas

```
runs (una por búsqueda del usuario)
  id, topic, status, created_at, updated_at

studies (papers encontrados, muchos por run)
  id, run_id → runs.id
  title, abstract, authors, year, source, doi
  full_text_url, full_text_status
  intro_text, conclusion_text
  is_duplicate

screening_decisions (decisiones de screening, una por paper por stage)
  id, study_id → studies.id, run_id
  stage ('title_abstract' | 'intro_conclusion')
  decision ('include' | 'exclude' | 'maybe')
  reason, confidence, by_human

dare_scores (puntuación de calidad)
  id, study_id → studies.id, run_id
  q1, q2, q3, q4, total, tier
  justification, confidence, by_human

extractions (datos estructurados extraídos)
  id, study_id → studies.id, run_id
  qcbp_layers[], research_questions[]
  methodology, key_finding, quantitative_evidence, limitations
```

### ¿Por qué tantas tablas separadas?

Podría parecer que sería más simple tener una sola tabla gigante con todos los campos. Pero eso viola el principio de **normalización**:

**Problema con tabla única:**
```
study: { title, abstract, ta_decision, ta_reason, ic_decision, ic_reason, dare_q1... }
```
- Si un paper tiene 3 decisiones de screening (por ejemplo, la IA y dos humanos), ¿pones 3 filas duplicando título y abstract?
- Si cambia un campo de screening, tienes que actualizar en múltiples lugares

**Ventaja de tablas separadas:**
- Cada tabla tiene una responsabilidad única (Single Responsibility Principle)
- Los joins de SQL permiten combinarlas cuando necesitas datos de varias
- Puedes añadir una tabla nueva sin modificar las existentes

### El problema del límite de URL en `.in()`

Este fue otro bug importante. Supabase usa HTTP/REST. Cuando haces:

```javascript
supabase.from('screening_decisions')
  .in('study_id', arrayDe500UUIDs)
```

Internamente esto se convierte en una URL como:
```
GET /screening_decisions?study_id=in.(id1,id2,...,id500)
```

Un UUID tiene 36 caracteres. Con 500 UUIDs, eso son 18.000+ caracteres solo para ese parámetro. Los servidores web tienen límites de URL (típicamente 8KB). La petición **falla silenciosamente** — Supabase devuelve un array vacío en lugar de error.

La solución es hacer las peticiones en **chunks**:

```javascript
const CHUNK = 200
for (let i = 0; i < studyIds.length; i += CHUNK) {
  const chunk = studyIds.slice(i, i + CHUNK)
  const { data } = await supabase.from('...').in('study_id', chunk)
  // acumular resultados
}
```

**Lección**: nunca asumas que una petición que no da error funcionó correctamente. Verifica siempre los datos devueltos.

---

## 6. Claude / Anthropic

### Qué modelos usamos y por qué

En el proyecto usamos tres modelos diferentes:

| Modelo | Velocidad | Coste | Inteligencia | Usado para |
|--------|-----------|-------|--------------|------------|
| claude-haiku-4-5 | Muy rápido | Muy barato | Buena | Normalizar queries, extraer secciones |
| claude-opus-4-6 | Lento | Caro | Excelente | Screening, DARE, Extracción |

**Principio de economía**: no uses el modelo más potente para todo. Para convertir "LLM quantum finance" en un Boolean string, Haiku es suficiente. Para evaluar si un paper de 3.000 palabras cumple criterios de elegibilidad, necesitas Opus.

### Cómo llamamos a Claude

```javascript
const response = await anthropic.messages.create({
  model:      'claude-opus-4-6',
  max_tokens: 400,
  messages: [{
    role:    'user',
    content: buildScreeningPrompt(title, abstract, criteria)
  }]
})

const raw  = response.content[0].text.trim()
const text = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '')
const data = JSON.parse(text)
```

**Por qué limpiamos el JSON**: Claude a veces envuelve el JSON en un bloque de código markdown (```json ... ```). La regex `.replace(/^```json\s*/i, '')` elimina esa envoltura antes de parsear.

### Prompt engineering — el arte de hablar con la IA

La calidad del output depende directamente del prompt. Malos prompts = malos resultados. Nuestros prompts siguen estas reglas:

1. **Rol claro**: "You are performing Stage 2 eligibility assessment..."
2. **Criterios explícitos**: listamos literalmente qué incluir y qué excluir
3. **Formato forzado**: "Respond ONLY with JSON — no markdown, no explanation"
4. **Ejemplo implícito**: el formato JSON especifica exactamente los campos

**Riesgo**: si el modelo devuelve algo que no es JSON válido, el `JSON.parse()` lanza una excepción. Por eso siempre hay un `try/catch` que devuelve una decisión `'maybe'` con confianza 0 para mandarlo a revisión humana.

### El sistema HITL — Human In The Loop

La confianza es un número entre 0 y 1 que Claude asigna a su propia decisión. Si la confianza es baja (< 0.75 en Stage 2), el paper no se excluye automáticamente — se marca como `'maybe'` y va a revisión humana.

```javascript
const needsHITL = result.confidence < confidenceThreshold
if (needsHITL) {
  result.decision = 'maybe'
  result.reason   = `[HITL Stage 2 — conf ${result.confidence.toFixed(2)}] ${result.reason}`
}
```

**Por qué es importante**: un sistema de IA sin HITL es un sistema sin supervisión. En investigación científica, las decisiones de inclusión/exclusión deben ser auditables y revisables. El HITL no es un parche — es una característica de diseño deliberada.

---

## 7. React y Vite

### ¿Qué es React?

React es una **librería JavaScript** para construir interfaces de usuario. El concepto central es el **componente**: una función que recibe datos (props) y devuelve HTML (JSX).

```jsx
function TierBadge({ tier }) {
  const colors = {
    high:   { bg: '#d1fae5', color: '#065f46' },
    medium: { bg: '#fef3c7', color: '#92400e' },
    low:    { bg: '#fee2e2', color: '#991b1b' },
  }
  return (
    <span style={{ background: colors[tier].bg, color: colors[tier].color }}>
      {tier}
    </span>
  )
}
```

**Sin React**, tendrías que manipular el DOM manualmente: `document.getElementById('badge').style.background = ...`. Con cientos de elementos, eso se vuelve un caos.

React gestiona un **Virtual DOM**: una representación en memoria del DOM real. Cuando los datos cambian, React calcula la diferencia mínima y actualiza solo lo necesario.

### Estado y efectos

Los dos hooks más importantes:

```javascript
// useState — guarda un valor que puede cambiar
const [loading, setLoading] = useState(true)
// loading empieza como true
// cuando termina la carga: setLoading(false) → React re-renderiza

// useEffect — ejecuta código cuando algo cambia
useEffect(() => {
  refresh()                              // ejecutar al montar
  const interval = setInterval(refresh, 3000)  // y cada 3 segundos
  return () => clearInterval(interval)  // cleanup al desmontar
}, [runId])  // se re-ejecuta si runId cambia
```

**El bug del closure obsoleto (stale closure)**: cuando una función en React captura una variable de estado, captura su valor en el momento en que la función fue creada. Si el estado cambia después, la función sigue viendo el valor antiguo.

```javascript
// BUG: handleDecide captura 'papers' al renderizar
// si papers cambia después, handleDecide ve la versión antigua
const handleDecide = async (id, decision) => {
  const updated = papers.filter(p => p.id !== id)  // papers obsoleto!
  setPapers(updated)
}
```

La solución es usar el **form funcional** de setState:

```javascript
setPapers(prev => prev.filter(p => p.id !== id))  // prev siempre es el valor actual
```

### ¿Por qué Vite?

Vite es la herramienta de build moderna que reemplaza a Webpack. La diferencia principal:

- **Webpack**: empaqueta todo el código antes de servir → inicio lento (30-60 segundos)
- **Vite**: sirve módulos ES nativos → inicio en < 1 segundo

**El bug de compatibilidad**: Vite 8 usa `rolldown` como bundler interno, que requiere Node.js >= 20.19. El sistema del usuario tiene Node 20.12.2. Solución: degradar a Vite 5, que es estable y compatible.

**Lección**: las versiones importan. Antes de actualizar una dependencia, mira sus requisitos del sistema.

---

## 8. El pipeline completo

Vamos paso a paso por cada etapa del pipeline, explicando qué ocurre internamente.

### Etapa 0: Creación del run

```
Usuario → POST /api/runs/create { topic, description }
Servidor → crea fila en tabla 'runs' con status='pending'
Servidor → añade job a slr-search queue
Servidor → responde al usuario con el run (< 200ms)
SearchWorker → recoge el job y empieza a trabajar
```

El usuario ve inmediatamente la pantalla de progreso. El trabajo real ocurre en background.

### Etapa 1: Búsqueda en fuentes académicas

El `SearchAgent` consulta 4 APIs académicas:

**OpenAlex** — base de datos open source de 200M+ papers
```
GET https://api.openalex.org/works?search="LLM" AND "quantum"&filter=publication_year:2018-2026
```

**arXiv** — repositorio de preprints (especialmente física, CS, matemáticas)
```
GET https://export.arxiv.org/api/query?search_query=(all:"LLM") AND (all:"quantum computing")
```
Aquí usamos `all:` prefix porque arXiv no interpreta Boolean sin él.

**IEEE Xplore** — papers de ingeniería y electrónica
```
GET https://ieeexploreapi.ieee.org/api/v1/search/articles?querytext="LLM" AND "quantum"
```

**Crossref** — metadatos bibliográficos de millones de publicaciones
```
GET https://api.crossref.org/works?query="LLM quantum computing"
```
Crossref no soporta Boolean real, así que solo mandamos términos clave relevantes.

**Por qué cada API necesita un adaptador diferente**: el sistema `query-adapter.js` convierte el mismo Boolean string en el formato que cada API entiende. Sin esto, arXiv recibiría `("LLM") AND ("quantum")` literalmente como texto a buscar, en lugar de como operadores lógicos.

### Etapa 2: Deduplicación

Los mismos papers aparecen en múltiples bases de datos. Un paper de arXiv puede estar también en OpenAlex y Crossref. La deduplicación usa el **DOI** (Digital Object Identifier) como clave única.

```javascript
if (seenDOIs.has(study.doi)) {
  study.is_duplicate = true  // marcado pero no borrado
}
```

Los duplicados se guardan con `is_duplicate=true`. No se borran porque en el diagrama PRISMA necesitamos saber cuántos duplicados se eliminaron.

### Etapa 3: Screening Stage 1 (Título y Abstract)

Para cada paper no duplicado, Claude evalúa título + abstract contra los criterios de inclusión/exclusión.

```
PAPER (title + abstract)  →  Claude Opus  →  { decision, reason, confidence, criteria_matched }
```

Resultado guardado en `screening_decisions` con `stage='title_abstract'`.

Papers con confianza < 0.70 → `decision='maybe'` → cola HITL.

**Tiempo típico**: con 380 papers a 500ms de delay entre llamadas = ~3 minutos.

**¿Por qué el delay?** Para no saturar la API de Anthropic con demasiadas llamadas simultáneas (rate limiting). Es una cortesía hacia el servicio externo y también evita errores `429 Too Many Requests`.

### Etapa 4: Recuperación de texto completo

El `RetrievalAgent` intenta obtener el texto completo de los papers incluidos en Stage 1.

**Estrategia 1: ar5iv.org** (solo papers de arXiv)
ar5iv convierte el LaTeX de arXiv en HTML estructurado. Mucho más limpio que el PDF.

**Estrategia 2: Unpaywall**
```
GET https://api.unpaywall.org/v2/{DOI}?email=research@slr.app
```
Devuelve la URL del PDF open access (si existe). ~50% de los papers académicos tienen versión OA.

**Estrategia 3: Descarga y parseo del PDF**
Con `pdf-parse`, convierte el PDF en texto plano. Luego Claude (Haiku, barato) extrae las secciones de Introducción y Conclusión.

**¿Por qué solo intro y conclusión?**
Un paper puede tener 30-50 páginas. Mandar todo a Claude sería caro y lento. La introducción contiene la motivación y objetivos; la conclusión contiene los hallazgos clave. Con esas dos secciones tienes el 80% de la información relevante.

### Etapa 5: Screening Stage 2 (Introducción y Conclusión)

Mismo proceso que Stage 1 pero con criterios más estrictos y usando el texto completo. Si no hay texto completo disponible, usa el abstract (fallback graceful).

Umbral de confianza más alto: 0.75 (vs 0.70 en Stage 1). En Stage 2 ya filtramos los claramente relevantes — aquí somos más exigentes.

Resultado guardado con `stage='intro_conclusion'`.

### Etapa 6: DARE Scoring

Para cada paper incluido en Stage 2, Claude evalúa la calidad metodológica con 4 preguntas:

| Pregunta | Evalúa |
|----------|--------|
| Q1 — Scope | ¿Están bien definidos los objetivos del paper? |
| Q2 — Methodology | ¿La metodología es válida y reproducible? |
| Q3 — Results | ¿Los resultados son claros y tienen evidencia? |
| Q4 — Relevance | ¿El paper es relevante para QCBP? |

Puntuación: Y=1, P=0.5, N=0. Total: 0-4 puntos.

**¿Por qué es importante la evaluación de calidad?**

No todos los papers publicados son buenos. Algunos tienen metodologías débiles, resultados no reproducibles, o conclusiones que el texto no justifica. En una SLR, si incluyes papers de baja calidad en tu síntesis, tus conclusiones serán débiles. DARE filtra los papers metodológicamente sólidos.

### Etapa 7: Extracción de datos

Para los papers con DARE alto o medio, Claude extrae datos estructurados:

```json
{
  "qcbp_layers": ["L1", "L3"],
  "research_questions": ["RQ1", "RQ3"],
  "methodology": "Hybrid classical-quantum QAOA for portfolio optimization",
  "key_finding": "QAOA outperforms classical VaR by 23% on 50-asset portfolios",
  "quantitative_evidence": "23% improvement, p<0.01, N=100 simulations",
  "limitations": "Only tested on simulated quantum hardware"
}
```

Esta estructura permite hacer análisis cruzados: ¿cuántos papers abordan L1? ¿Cuáles responden RQ3?

---

## 9. Server-Sent Events

### El problema que resuelven

Hasta ahora, la comunicación era siempre **cliente → servidor** (petición/respuesta). Pero para mostrar logs en tiempo real necesitamos lo contrario: que el **servidor empuje** datos al cliente cuando ocurren.

Hay tres tecnologías para esto:

| Tecnología | Bidireccional | Complejidad | Caso de uso |
|------------|---------------|-------------|-------------|
| Polling | No | Baja | El cliente pregunta cada N segundos |
| SSE | Solo servidor→cliente | Baja | Streams de datos unidireccionales |
| WebSockets | Bidireccional | Media | Chat, juegos en tiempo real |

Para logs, SSE es perfecto: el servidor manda logs, el cliente solo recibe.

### Cómo funciona SSE

**En el servidor:**
```javascript
router.get('/logs/stream', (req, res) => {
  // Cabeceras especiales que activan el modo SSE
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()  // manda las cabeceras inmediatamente

  // Mandamos el historial reciente al conectar
  for (const line of getRecentLogs()) {
    res.write(`data: ${JSON.stringify(line)}\n\n`)
    //        ↑ formato SSE: "data: " + contenido + doble salto de línea
  }

  // Nos suscribimos a nuevos logs
  const send = (line) => res.write(`data: ${JSON.stringify(line)}\n\n`)
  onLog(send)

  // Cuando el usuario cierra el tab, limpiamos
  req.on('close', () => offLog(send))
})
```

**En el frontend:**
```javascript
const es = new EventSource('/api/logs/stream')
es.onmessage = (e) => {
  const line = JSON.parse(e.data)
  setLines(prev => [...prev, line])
}
```

### El interceptor de console.log

Para capturar los logs del servidor, reemplazamos `console.log` con nuestra versión:

```javascript
// Guardamos la función original
const _log = console.log.bind(console)

// La reemplazamos
console.log = (...args) => {
  _log(...args)           // seguimos mostrando en terminal
  broadcast('info', args) // Y además lo enviamos a los clientes SSE
}
```

Esto se hace en `log-broadcaster.js` y se importa como **primer import** en `server.js`. Si no fuera el primero, los logs anteriores a ese import no se capturarían.

**Riesgo**: si un módulo importa `console.log` antes de que se ejecute el interceptor, sus logs no se capturan. En ESM (módulos de JavaScript), los imports se ejecutan antes del código del módulo, por eso el orden de imports importa.

---

## 10. PRISMA 2020

### ¿Qué es PRISMA?

PRISMA (Preferred Reporting Items for Systematic Reviews and Meta-Analyses) es el estándar internacional para reportar revisiones sistemáticas de literatura. Es como las normas APA pero para SLRs.

El **diagrama de flujo PRISMA** es la representación visual del proceso de selección de estudios. Es obligatorio en cualquier paper que presente una SLR para que los revisores puedan verificar el proceso.

### Las cuatro fases

```
IDENTIFICACIÓN
  ↓ (cuántos papers encontramos en cada base de datos)
SCREENING
  ↓ (cuántos pasaron el filtro de título/abstract)
ELEGIBILIDAD
  ↓ (cuántos pasaron el filtro de texto completo)
INCLUSIÓN
  (cuántos entran en la síntesis final)
```

### Por qué registramos cada número

En el diagrama PRISMA real (la foto que enviaste), cada número tiene que justificarse. Si tu diagrama dice "n=325 excluidos" tienes que poder decir por qué razón se excluyó cada uno. Por eso en nuestro sistema guardamos `screening_decisions.reason` para cada exclusión.

Un revisor de tu tesis puede pedirte: "¿Por qué excluiste el paper de Smith (2021)?" y tú puedes responder con el reason exacto que Claude (o tú) introdujo en el sistema.

---

## 11. DARE

### ¿Por qué evaluar calidad?

Imagina que incluyes en tu síntesis un paper que dice "los ordenadores cuánticos son 1000 veces más rápidos que los clásicos" — pero ese paper tiene una muestra de 5 casos, no tiene grupo de control, y fue publicado en una revista predatoria. Si basas tus conclusiones en ese paper, tu tesis tiene un problema.

DARE (Kitchenham) es un marco de evaluación de calidad diseñado específicamente para SLRs en ingeniería de software y ciencias de la computación.

### Las cuatro dimensiones

**Q1 — Scope**: ¿El paper sabe de qué está hablando?
- Y: los objetivos están claramente definidos, acotados, con hipótesis explícita
- P: los objetivos son vagos o demasiado amplios
- N: no hay sección de objetivos o es completamente genérica

**Q2 — Methodology**: ¿Podría otro investigador replicar este estudio?
- Y: metodología detallada, dataset disponible, código publicado
- P: metodología descrita pero con gaps
- N: "hicimos experimentos" sin más detalle

**Q3 — Results**: ¿Los datos apoyan las conclusiones?
- Y: resultados cuantitativos con estadísticas, tablas, gráficos
- P: resultados parcialmente cuantificados
- N: conclusiones sin evidencia numérica

**Q4 — Relevance**: ¿Aplica a QCBP?
- Y: el paper directamente aborda una de las capas L1-L5
- P: relacionado tangencialmente
- N: el paper no tiene relación real con QCBP

### Tiers y su implicación

| Tier | Score | Significado |
|------|-------|-------------|
| Alto | ≥ 3.0 | Evidencia sólida, incluir en síntesis |
| Medio | 1.5-2.9 | Evidencia útil pero con limitaciones |
| Bajo | < 1.5 | Evidencia débil, excluir de síntesis principal |

Un paper de tier bajo no se borra del sistema. Se mantiene en la lista completa para transparencia, pero no contribuye a las conclusiones principales de la tesis.

---

## 12. Los bugs que encontramos

Esta sección es importante porque los bugs no son fallos del programador — son lecciones. Cada bug te enseña algo sobre cómo funciona el sistema.

### Bug 1: El Worker no procesaba jobs

**Síntoma**: el log mostraba `job 15 enqueued` repetidamente pero nunca `Worker procesando job 15`.

**Causa raíz**: Queue y Worker compartían la misma conexión Redis. El Worker usa `BLPOP` (comando bloqueante) para esperar trabajo. Al bloquear la conexión, la Queue no podía añadir nuevos jobs. El Worker esperaba trabajo que nunca llegaba porque él mismo lo bloqueaba.

**Lección**: cuando uses BullMQ, siempre usa conexiones Redis separadas para Queue y Worker. La documentación lo menciona pero con una frase pequeña que es fácil pasar por alto.

### Bug 2: node --watch reiniciaba el servidor

**Síntoma**: el servidor mostraba `Restarting 'src/server.js'` a mitad del proceso, interrumpiendo el screening.

**Causa raíz**: `node --watch` reinicia el proceso completo cuando detecta cambios en cualquier archivo `.js`. Un Worker en mitad de una tarea se mata. El job en Redis queda en estado `active` (aunque nadie lo está procesando).

**Lección**: `node --watch` es solo para **desarrollo activo** cuando estás editando código. Cuando necesitas que el backend procese un job largo sin interrupciones, usa `npm start` (que llama a `node src/server.js` sin watch).

### Bug 3: arXiv devolvía 0 resultados

**Síntoma**: la búsqueda en arXiv siempre devolvía 0 resultados con strings complejos.

**Causa raíz**: el código original hacía `encodeURIComponent(query)`, lo que convertía `AND` en `%26AND%26` y las comillas en `%22`. arXiv recibía literalmente el texto `%22LLM%22%20AND%20%22quantum%22` y lo interpretaba como términos de búsqueda, no como operadores.

**Lección**: `encodeURIComponent` y `URLSearchParams` no son lo mismo. `URLSearchParams` codifica los valores pero mantiene los operadores de query string. Para arXiv, además, hay que usar el formato `all:"término"` para que reconozca los operadores.

### Bug 4: Las estadísticas siempre mostraban 0

**Síntoma**: en RunProgress, los contadores de "incluidos" y "excluidos" siempre mostraban 0 incluso cuando había decisiones en la base de datos.

**Causa raíz**: la consulta `.in('study_id', arrayDe500UUIDs)` enviaba una URL demasiado larga a Supabase. El servidor rechazaba silenciosamente la petición devolviendo un array vacío. El código no detectaba el error porque no hubo excepción — solo datos vacíos.

**Lección**: las APIs a veces fallan silenciosamente (sin lanzar excepciones). Valida siempre que los datos devueltos tienen sentido. Implementa chunking para arrays grandes.

### Bug 5: pdf-parse v2 no funcionaba

**Síntoma**: `process.getBuiltinModule is not a function` al intentar parsear un PDF.

**Causa raíz**: `pdf-parse` v2 usa una API de Node.js (`process.getBuiltinModule`) que solo existe en Node 22+. El sistema tiene Node 20.12.2.

**Lección**: antes de instalar una dependencia, verifica sus requisitos. La mayoría de librerías tienen una sección `engines` en su `package.json` que especifica qué versión de Node necesitan.

### Bug 6: Backoff delay como string

**Síntoma**: el comportamiento de retry de BullMQ era impredecible.

**Causa raíz**: `delay: '5000'` (string) en lugar de `delay: 5000` (número). JavaScript tiene coerción de tipos implícita que en algunos contextos convierte el string a número, pero BullMQ internamente esperaba un número.

**Lección**: TypeScript hubiera detectado este bug en tiempo de compilación. JavaScript dinámico permite pasar strings donde se esperan números. Cuando pases configuración a librerías externas, verifica los tipos exactos en la documentación.

---

## 13. Riesgos y limitaciones

### Riesgos técnicos

**Dependencia de servicios externos**
El sistema depende de: Anthropic API, Supabase, Redis (RedisLabs), 4 APIs académicas, Unpaywall, ar5iv. Si cualquiera de ellos falla, parte del pipeline se detiene. Mitigación: implementar reintentos y manejo de errores graceful.

**Coste de la API de Anthropic**
Cada screening call cuesta ~0.002-0.02€ dependiendo del modelo. Con 380 papers:
- Stage 1: 380 × $0.015 ≈ $5.70
- Stage 2: ~40 × $0.03 ≈ $1.20
- DARE: ~20 × $0.04 ≈ $0.80
Total: ~$8 por run completo

Si haces 10 runs de prueba sin pensar, estás quemando $80 fácilmente. Monitoriza el uso en la consola de Anthropic.

**Alucinaciones de Claude**
Claude puede inventar criterios o malinterpretar un paper. El umbral de confianza + HITL mitiga esto, pero no lo elimina completamente. Para una tesis doctoral, todos los papers incluidos en la síntesis final deben ser verificados manualmente.

### Limitaciones metodológicas

**APIs sin cobertura completa**
OpenAlex, arXiv, IEEE y Crossref no cubren el 100% de la literatura académica. Scopus y Web of Science tienen cobertura significativamente mayor pero requieren licencia institucional de pago.

**Sesgo hacia papers con abstract**
Los papers sin abstract (algunos proceedings viejos, reports técnicos) se marcan como inelegibles automáticamente. Esto puede excluir fuentes relevantes.

**Deduplicación por DOI solamente**
Si el mismo paper tiene dos DOIs diferentes (versión arXiv + versión publicada), no se detecta como duplicado. La deduplicación perfecta requería comparar títulos con fuzzy matching, lo que es computacionalmente costoso.

**Idioma**
Los criterios de screening están en inglés y asumen papers en inglés. Papers en otros idiomas pueden ser erróneamente excluidos o mal evaluados.

### Qué haría un ingeniero senior diferente

1. **Tests automatizados**: cada agente debería tener tests unitarios con fixtures de papers conocidos para verificar que las decisiones son correctas.

2. **Observabilidad**: integrar OpenTelemetry para tracing distribuido. Poder responder "¿por qué tardó 12 minutos el job 42?" requiere tracing detallado.

3. **Rate limiting en la API**: el endpoint `/runs/create` no tiene límite de llamadas. Un usuario podría crear 100 runs simultáneos y agotar los créditos de Anthropic.

4. **Caché de embeddings**: para deduplicación semántica (papers similares aunque no idénticos), necesitarías embeddings vectoriales cacheados. Supabase soporta `pgvector` para esto.

5. **CI/CD**: cada push al repositorio debería ejecutar tests automáticamente y desplegar a producción solo si pasan.

---

## Resumen ejecutivo

Has construido un sistema de **automatización de revisión sistemática de literatura** que:

1. Busca papers en 4 bases de datos académicas simultáneamente
2. Usa IA (Claude) para screening en dos fases
3. Recupera textos completos vía open access
4. Evalúa calidad metodológica con DARE
5. Extrae datos estructurados para síntesis
6. Muestra todo en tiempo real via SSE
7. Permite revisión humana en los casos de baja confianza
8. Genera el diagrama PRISMA 2020 automáticamente

Las tecnologías clave que has aprendido:
- **Node.js/Express**: API asíncrona con colas de trabajo
- **BullMQ/Redis**: procesamiento en background resiliente
- **Supabase/PostgreSQL**: persistencia relacional en la nube
- **React**: interfaces reactivas con estado
- **SSE**: comunicación servidor→cliente en tiempo real
- **Prompt engineering**: cómo hablar con modelos de lenguaje para obtener outputs estructurados

El sistema no es perfecto — ningún sistema lo es — pero está diseñado para ser **auditable**, **reproducible** y **extensible**. Esas tres características son las que distinguen un proyecto de investigación serio de un prototipo desechable.
