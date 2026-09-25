# Gestión de Proyectos Educativos

Aplicación full-stack para administrar el catálogo de proyectos por Grupo/Nivel,
cargar y clasificar alumnos masivamente, personalizar sus planes **por competencia**
y generar documentos PDF individuales, ZIP por grupo o exportaciones masivas
(CSV, Excel, XML, JSON).

## Arquitectura

```
Clasificador-de-Trayectorias/
├── api/
│   └── index.js               # Entry serverless de Vercel -> Express
├── vercel.json                # Build, rewrites (/api/* y SPA) y límites
├── backend/                     # API Node.js + Express
│   ├── server.js                # Punto de entrada local (npm run dev)
│   ├── src/
│   │   ├── app.js               # App Express sin listen (local + Vercel)
│   │   ├── data/
│   │   │   ├── db.js            # Único punto de datos: driver KV o JSON local
│   │   │   ├── kvClient.js      # Cliente REST de Vercel KV (Upstash)
│   │   │   ├── students.json    # Semilla/datos locales de alumnos
│   │   │   └── projects.json    # Catálogo: grupos + competencias + proyectos
│   │   ├── routes/
│   │   │   ├── projects.js      # Catálogo completo (grupos, competencias, celdas)
│   │   │   ├── students.js      # CRUD de alumnos + reclasificación
│   │   │   ├── upload.js        # Carga masiva Excel/CSV + clasificación automática
│   │   │   ├── documents.js     # PDF individual y ZIP por grupo
│   │   │   └── export.js        # Exportación masiva CSV / Excel / XML / JSON
│   │   └── services/
│   │       ├── classifier.js    # Algoritmo alumno -> proyecto (snapshot por competencia)
│   │       ├── pdfGenerator.js  # PDF con tabla de competencias (pdfkit)
│   │       └── exporters.js     # Generadores CSV / XML / JSON / XLSX
│   └── package.json
│
└── frontend/                    # React + Vite + Tailwind
    ├── src/
    │   ├── api/client.js        # Cliente HTTP (axios) + descargas + exportación
    │   ├── constants.js         # Niveles, etiquetas, colores
    │   ├── components/
    │   │   └── StudentEditPanel.jsx
    │   ├── pages/
    │   │   ├── CatalogPage.jsx      # Módulo 1: grupos, competencias y catálogo
    │   │   ├── UploadPage.jsx       # Módulo 2: carga masiva y clasificación
    │   │   └── StudentsPage.jsx     # Módulo 3 y 4: personalización + documentos
    │   ├── App.jsx
    │   └── main.jsx
    └── package.json
```

## Cómo ejecutar

### 1. Backend

```bash
cd backend
npm install
npm run dev        # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

El `vite.config.js` incluye un proxy de `/api` hacia `http://localhost:4000`.

## Despliegue en Vercel (producción)

Todo corre en un único proyecto de Vercel: el SPA (Vite) y la API (function
`api/index.js`), con **Vercel KV** como base de datos en la nube.

1. **Importa el repositorio** en Vercel (framework detectado: Vite). El
   `vercel.json` de la raíz ya configura instalación, build (`frontend/dist`),
   el rewrite de `/api/*` a la function y el fallback SPA para React Router.
2. **Crea el almacén KV**: Vercel → *Storage* → *KV* (Upstash). Al conectarlo,
   Vercel inyecta `KV_REST_API_URL` y `KV_REST_API_TOKEN` automáticamente.
3. **Deploy**. En la primera petición, `db.js` siembra KV con los JSON
   empaquetados (`students.json` y `projects.json`): tus datos locales pasan a
   la nube sin pasos extra.
4. Verifica: `https://<tu-proyecto>.vercel.app/api/health` debe responder
   `{"status":"ok","storage":"kv"}`.

Notas de la nube (plan Hobby):

- **Sin variables KV, la app usa los JSON locales** → `storage: "json"` en
  health. Ese es también el modo de desarrollo local.
- Límite de subida: **4 MB** (XLSX/CSV); respuestas de ~4.5 MB (los ZIP de
  grupos muy grandes pueden excederlo).
- `maxDuration: 60` s por invocación (PDF/ZIP largos).
- Los límites de concurrencia y vida de la function aplican a cada petición:
  no hay estado en memoria entre peticiones (el catálogo se lee de KV en cada
  una, operación barata).

## Flujo de uso

1. **Catálogo**
   - **Grupos**: A–F vienen por defecto y se pueden editar (etiqueta, edad) o
     eliminar; se pueden añadir subgrupos como `A1`, `A2`, `A3` (letras y números).
   - **Competencias**: vienen 5 obligatorias (Abstracción, Pensamiento
     lógico-matemático, Pensamiento computacional, Implementación técnica y
     Competencias digitales) que no se pueden eliminar, más las que quieras añadir.
   - **Matriz Grupo × Nivel**: cada celda define materia, dominio disciplinar,
     meta general y, por competencia: descripción base del alumno, Trimestre 1–3 y Meta.
     En la descripción base se pueden usar `{{nombre}}`, `{{grupo}}`, `{{nivel}}`
     y `{{edad}}`, que se reemplazan por cada alumno.
2. **Carga Masiva** — Sube un Excel/CSV con columnas `nombre, grupo, nivel,
   diagnostico, intereses, fortalezas, areasMejora` (máx. 4 MB).
3. **Alumnos** — Filtra por grupo/nivel/búsqueda y abre el panel individual para
   editar el perfil y **cada competencia por separado** (sin afectar el catálogo).
   El botón "Restaurar del catálogo" vuelve a los valores maestros.
4. **Documentos y exportación**
   - PDF individual (tabla de competencias, A4 apaisado, con paginación).
   - ZIP con un PDF por alumno de un grupo (filtro opcional de nivel).
   - Exportación masiva de los filtros actuales en **CSV, Excel (.xlsx), XML o JSON**.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET / PUT | `/api/projects` | Catálogo completo `{grupos, competencias, proyectos}` |
| GET / POST / PUT / DELETE | `/api/students...` | CRUD de alumnos y `/:id/reclasificar` |
| POST | `/api/upload` | Carga masiva Excel/CSV |
| GET | `/api/documents/student/:id` | PDF individual |
| GET | `/api/documents/group/:grupo?nivel=` | ZIP por grupo |
| GET | `/api/export?format=csv\|xlsx\|xml\|json&grupo=&nivel=&nombre=` | Exportación masiva |

## Notas de diseño

- **Persistencia**: `src/data/db.js` es el único punto de acceso a los datos y
  expone una interfaz **asíncrona** con dos drivers intercambiables:
  **Vercel KV (Upstash)** cuando existen las variables `KV_REST_API_*`
  (producción), o **JSON local con escritura atómica** (desarrollo). La
  migración a SQLite/PostgreSQL seguiría reescribiendo solo ese archivo.
- **Snapshot por alumno**: `classifier.js` guarda una copia del proyecto
  (`proyectoAsignado`) al clasificar, incluidas las competencias. Esto permite
  editar un alumno sin que cambie retroactivamente si luego se edita el catálogo.
  Al guardar el catálogo se sincronizan las competencias nuevas/eliminadas en los
  alumnos existentes sin pisar sus ediciones.
- **PDF**: generado con `pdfkit` en A4 apaisado, con tabla de competencias
  (Competencia · Descripción del alumno · Dominio · T1 · T2 · T3 · Meta),
  celdas de altura dinámica, saltos de página con encabezado repetido y pie con
  número de página.
- **Errores**: la API responde JSON con el estado adecuado (400/404/409/500),
  hay límite de tamaño en subidas (4 MB, límite de Vercel) y el frontend muestra
  banners de error en cada operación (los indicadores de carga nunca quedan
  trabados).
- **Siguientes pasos sugeridos**: autenticación de usuarios/roles, historial de
  versiones por alumno, plantilla DOCX editable y migración de `db.js` a
  PostgreSQL con Prisma/Knex cuando el volumen lo requiera.
