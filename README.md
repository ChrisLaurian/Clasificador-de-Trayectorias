# Gestión de Proyectos Educativos

Aplicación full-stack para administrar el catálogo de proyectos por Grupo/Nivel,
cargar y clasificar alumnos masivamente, personalizar sus planes y generar
documentos PDF individuales o en ZIP por grupo.

## Arquitectura

```
proyecto-educativo/
├── backend/                     # API Node.js + Express
│   ├── server.js                # Punto de entrada
│   ├── src/
│   │   ├── data/
│   │   │   ├── db.js            # Persistencia simple en JSON (migrable a SQLite/Postgres)
│   │   │   ├── students.json    # (se crea automáticamente)
│   │   │   └── projects.json    # (se crea automáticamente)
│   │   ├── routes/
│   │   │   ├── projects.js      # CRUD del catálogo Grupo x Nivel
│   │   │   ├── students.js      # CRUD de alumnos + reclasificación
│   │   │   ├── upload.js        # Carga masiva Excel/CSV + clasificación automática
│   │   │   └── documents.js     # Generación de PDF individual y ZIP por grupo
│   │   └── services/
│   │       ├── classifier.js    # Algoritmo de asociación alumno -> proyecto
│   │       └── pdfGenerator.js  # Generación del PDF con pdfkit
│   └── package.json
│
└── frontend/                    # React + Vite + Tailwind
    ├── src/
    │   ├── api/client.js        # Cliente HTTP centralizado (axios)
    │   ├── constants.js         # Grupos, niveles, etiquetas
    │   ├── components/
    │   │   └── StudentEditPanel.jsx
    │   ├── pages/
    │   │   ├── CatalogPage.jsx      # Módulo 1: Administración de catálogo
    │   │   ├── UploadPage.jsx       # Módulo 2: Carga masiva y clasificación
    │   │   └── StudentsPage.jsx     # Módulo 3 y 4: Personalización + generación
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

Al iniciar por primera vez se crean automáticamente `src/data/students.json`
(vacío) y `src/data/projects.json` (con las 18 celdas Grupo A-F × Nivel B/I/A
vacías, listas para configurar desde el frontend).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

El `vite.config.js` ya incluye un proxy de `/api` hacia `http://localhost:4000`,
así que no hace falta configurar CORS manualmente para desarrollo.

## Flujo de uso

1. **Catálogo** — Define materia, dominio disciplinar, los 3 trimestres y la
   meta general para cada combinación de Grupo (A–F) y Nivel (Básico,
   Intermedio, Avanzado).
2. **Carga Masiva** — Sube un Excel/CSV con columnas `nombre, grupo, nivel,
   diagnostico, intereses, fortalezas, areasMejora`. Cada fila se clasifica
   automáticamente contra el catálogo.
3. **Alumnos** — Filtra por grupo/nivel, abre el panel individual para ajustar
   el perfil o el proyecto asignado (sin afectar el catálogo maestro), y
   descarga el PDF de ese alumno.
4. **Generación masiva** — Con un grupo seleccionado en el filtro, el botón
   "Descargar ZIP del grupo" genera un PDF por alumno y los empaqueta en un
   único archivo ZIP (puedes combinar con el filtro de nivel).

## Notas de diseño

- **Persistencia**: se usa JSON en disco por simplicidad. `src/data/db.js` es
  el único punto de acceso a los datos — migrar a SQLite o PostgreSQL implica
  reescribir solo ese archivo (mismas funciones `getStudents/saveStudents/...`).
- **Clasificación**: el algoritmo (`services/classifier.js`) toma una
  "fotografía" (`proyectoAsignado`) del proyecto del catálogo en el momento de
  la carga. Esto permite editar el proyecto de un alumno específico sin que
  cambie retroactivamente si luego se edita el catálogo general. El botón
  "Restaurar del catálogo" vuelve a sincronizar manualmente si se necesita.
- **PDF**: generado con `pdfkit` para no depender de binarios externos
  (a diferencia de `html-pdf-node`, que requiere Chromium). Si más adelante
  se requiere un diseño más elaborado con HTML/CSS, se puede sustituir por
  `docxtemplater` (DOCX a partir de una plantilla `.docx`) manteniendo la
  misma interfaz `generateStudentPDF(student)`.
- **Siguientes pasos sugeridos**: autenticación de usuarios/roles, historial
  de versiones por alumno, plantilla DOCX editable por el usuario, y
  migración de `db.js` a PostgreSQL con Prisma/Knex cuando el volumen de
  alumnos lo requiera.
