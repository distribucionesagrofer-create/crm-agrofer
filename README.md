# AGROFER CRM

CRM de WhatsApp con IA para Distribuciones Agrofer (Cúcuta, Colombia). Atiende conversaciones
por WhatsApp (línea oficial Meta Cloud API + líneas adicionales no oficiales vía
`whatsapp-web.js`), califica leads con un bot orquestado por IA, y centraliza clientes,
catálogo, campañas, plantillas y análisis comercial en un solo sistema.

## Qué incluye

- **Bandeja de conversaciones** multicanal (Meta Cloud API + whatsapp-web.js) en tiempo real (Socket.IO)
- **Bot con IA** (OpenAI, tool-calling) — consulta el catálogo real, escala a un vendedor,
  crea leads y tareas, con reglas de escalamiento inmediata configurables por línea
- **Editor visual de flujos** (React Flow) — automatiza respuestas antes de que la IA entre a tallar
- **Plantillas de WhatsApp** aprobadas por Meta y **campañas** masivas
- **Base de clientes** sincronizada con el Sistema Principal (ERP externo de AGROFER), con
  detección de país (CO/VE) y separación de números de teléfono combinados
- **Catálogo de productos** con fotos, precios y disponibilidad en vivo
- **Análisis comercial** (ventas por línea/artículo/vendedor, exportable a PDF) y **análisis
  de visitas**
- Multi-tenant: cada línea/vendedor tiene su propia configuración de IA, catálogo y reglas

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express |
| Base de datos | MongoDB 7 (Mongoose) |
| Caché / colas | Redis 7 |
| WhatsApp oficial | Meta WhatsApp Cloud API (webhook + Graph API) |
| WhatsApp adicional | whatsapp-web.js (Puppeteer/Chromium) |
| IA | OpenAI (tool-calling) |
| Frontend | React 18 + Vite + Tailwind |
| Tiempo real | Socket.IO |
| Proxy/edge | Nginx |
| Despliegue | Docker Compose |

## Requisitos previos

- Docker y Docker Compose
- Una cuenta de Meta for Developers con un número de WhatsApp Business (Cloud API) si vas a
  usar el canal oficial
- Un API key de OpenAI si vas a usar el bot con IA
- Acceso al Sistema Principal (ERP interno de AGROFER) si vas a sincronizar clientes/catálogo

## Instalación local (con Docker — recomendado)

```bash
git clone <url-del-repo>
cd agrofer-crm

# Variables de infraestructura (Mongo/Redis, carpetas de datos)
cp .env.example .env

# Variables de la aplicación (JWT, OpenAI, Sistema Principal, etc.)
cp backend/.env.example backend/.env
```

Edita ambos `.env` con tus valores reales (ver la tabla de variables más abajo), y luego:

```bash
docker-compose up --build -d
```

Esto levanta 5 contenedores: `nginx` (puerto 80/443), `frontend`, `backend`, `mongodb` y
`redis`. La app queda disponible en `http://localhost`.

Primer usuario admin y datos base (solo la primera vez, con la base vacía):

```bash
docker exec -it agrofer_crm-backend-1 node scripts/seed.js
```

El script no borra nada si ya detecta usuarios o vendedores existentes — para reiniciarlos a
propósito hay que correrlo explícitamente con `ALLOW_SEED_RESET=true` (borra TODO lo que haya).

### Ver logs

```bash
docker-compose logs -f backend
```

## Desarrollo local (sin reconstruir Docker en cada cambio)

Para iterar rápido en el backend/frontend sin rebuildear la imagen, levanta solo las bases de
datos con Docker y corre el resto directo con Node:

```bash
docker-compose -f docker-compose.dev.yml up -d   # solo mongo + redis, expuestos en localhost

cd backend && npm install && npm run dev          # nodemon, puerto 3000
cd frontend && npm install && npm run dev          # vite, puerto 5173
```

Con este modo, `backend/.env` debe apuntar a `mongodb://admin:<pass>@localhost:27017/...` en
vez del hostname `mongodb` (que solo resuelve dentro de la red de Docker).

## Variables de entorno

### Raíz — `.env` (usadas por `docker-compose.yml`)

| Variable | Descripción |
|---|---|
| `MONGO_PASSWORD` | Contraseña del usuario admin de MongoDB |
| `REDIS_PASSWORD` | Contraseña de Redis |
| `SESSIONS_DIR` | Carpeta del host donde se guardan las sesiones activas de WhatsApp |
| `UPLOADS_DIR` | Carpeta del host donde se guardan los archivos subidos (fotos, PDFs, etc.) |

### `backend/.env`

| Variable | Descripción |
|---|---|
| `PORT` | Puerto interno del backend (3000 por defecto, no se expone directo al host) |
| `MONGO_URI` | Cadena de conexión completa a MongoDB |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Conexión a Redis |
| `JWT_SECRET` | Secreto para firmar tokens de sesión — usa uno largo y aleatorio en producción |
| `JWT_EXPIRES_IN` | Duración del token (ej. `7d`) |
| `OPENAI_API_KEY` | Key de OpenAI para el bot — se puede sobreescribir desde Ajustes > IA en la UI |
| `FRONTEND_URL` | URL del frontend, usada para CORS |
| `PUBLIC_URL` | URL pública HTTPS del backend (dominio real en producción, ngrok en desarrollo) — la exige Meta API para servir adjuntos por link |
| `SP_API_KEY` | API key del Sistema Principal (ERP externo de AGROFER) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | Límite de requests por IP |

## Despliegue en un VPS

1. **Provisionar el VPS**: instala Docker y Docker Compose (`curl -fsSL https://get.docker.com | sh`).
2. **Clonar el repo** y crear los `.env` como en la instalación local, con valores reales de
   producción (contraseñas fuertes, `JWT_SECRET` largo, `PUBLIC_URL` con el dominio real).
3. **DNS**: apunta tu dominio (ej. `crm.agrofer.online`) a la IP del VPS.
4. **HTTPS — atención**: `nginx/nginx.conf` en este repo solo sirve HTTP plano en el puerto 80
   (el puerto 443 está expuesto en `docker-compose.yml` pero **no hay terminación TLS
   configurada todavía**). Meta Cloud API exige que el webhook sea HTTPS, así que antes de
   apuntar el webhook de producción necesitas una de estas dos opciones:
   - Generar certificados con Certbot/Let's Encrypt, montarlos en `nginx/certs/` y agregar un
     bloque `server { listen 443 ssl; ... }` a `nginx/nginx.conf`, o
   - Poner el dominio detrás de un proxy que ya termine TLS (Cloudflare en modo proxy, u otro
     nginx/Caddy delante de este stack).
5. **Levantar el stack**:
   ```bash
   docker-compose up --build -d
   ```
6. **Webhook de Meta**: en Meta for Developers, configura la URL del webhook como
   `https://tu-dominio/webhook/meta` con el token de verificación que hayas guardado en la
   línea principal (Ajustes > Vendedores > Meta API).
7. **Verificar salud**: `curl https://tu-dominio/health` debe responder `{"status":"ok"}`.

## Estructura del proyecto

```
backend/
  src/
    models/        # Esquemas de MongoDB
    routes/         # Endpoints REST, montados en server.js
    services/       # Lógica de negocio (bot, WhatsApp, flujos, Meta API, Sistema Principal)
    middleware/
  scripts/          # Scripts de mantenimiento (seed, backfills puntuales)
frontend/
  src/
    pages/          # Una página por módulo del CRM
    components/
    services/       # Cliente HTTP (axios) y socket.io
nginx/              # Proxy reverso — enruta / (frontend), /api, /webhook, /socket.io, /media
docs/               # Notas de investigación y roadmap histórico
```

## Documentación adicional

Ver [`docs/`](docs/) para notas de investigación (decompilación de la app oficial, mapa de
análisis) y el historial de funcionalidades pendientes.
