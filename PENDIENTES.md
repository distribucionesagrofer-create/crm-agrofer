# AGROFER CRM — Funcionalidades Pendientes

Ultima actualizacion: 2026-05-26

---

## PRIORIDAD ALTA

### 1. Captura de datos del cliente por el bot
El bot puede preguntar nombre, empresa, ciudad, producto de interes durante la conversacion
y guardarlos automaticamente en el registro del lead o cliente en MongoDB.
Actualmente el bot detecta intencion pero no almacena datos estructurados.
- Campo `conv.variables` ya existe en el modelo Conversation (Map)
- Falta: logica en el orchestrator para extraer y persistir esos datos
- Impacto: los vendedores veran el perfil del cliente pre-llenado cuando tomen la conversacion

### 2. Catalogo de productos para el bot
Cargar una lista de productos (nombre, precio, descripcion, disponibilidad) que el bot
pueda consultar para responder preguntas de precio y disponibilidad sin inventar datos.
- Modelo nuevo: Product (nombre, precio, stock, descripcion, categoria)
- Integracion con buildRichContext para inyectar productos relevantes al contexto de la IA
- UI: pagina /catalogo para agregar/editar productos
- Nota: el usuario no ha autorizado esto aun, confirmar antes de implementar

### 3. Estadisticas del bot por vendedor
En la pagina de detalle de cada vendedor (/vendedores/:id) mostrar metricas del bot:
- Cuantos leads creo el bot este mes
- Cuantas conversaciones escalo
- Tasa de resolucion sin escalacion
- Tiempo promedio antes de escalar
- Intenciones mas frecuentes

---

## PRIORIDAD MEDIA

### 4. Historial de tareas completadas por vendedor
En la pagina de Agenda/Tareas, agregar una vista de productividad:
cuantas tareas completo cada vendedor por semana/mes.
Util para supervision y seguimiento del equipo.

### 5. Asignacion de tareas a vendedores especificos
Actualmente las tareas quedan en la linea (tenantId) pero no tienen un usuario asignado.
Agregar campo `asignadoA` para que el admin pueda delegar tareas a vendedores especificos.

### 6. Notificacion cuando se crea un lead por el bot
Cuando el orchestrator ejecuta `crear_lead`, emitir evento socket al vendedor
igual que se hace con `bot:escalacion`. El vendedor veria un popup inmediato.

### 7. Respuesta del bot con contexto de tareas pendientes
Si existe una tarea pendiente para el mismo numero de telefono que esta escribiendo,
el bot deberia saberlo y mencionarlo ("Hola Carlos, teniamos pendiente llamarte...").

---

## PRIORIDAD BAJA / FUTURO

### 9. App movil o PWA
Convertir el frontend en PWA para que los vendedores puedan usarlo desde el celular
con notificaciones push nativas.

### 10. Flujos visuales conectados al bot
El editor de flujos (/flujos) actualmente es independiente del orchestrator.
Conectarlos para que un flujo pueda dispararse cuando el bot detecta una intencion especifica.

### 11. Reportes del bot
Agregar una seccion en /reportes con graficas de:
- Mensajes respondidos por IA vs por humano
- Leads creados por bot por semana
- Escalaciones por dia
- Intenciones mas frecuentes por linea

### 12. Entrenamiento del bot con conversaciones reales
Tomar conversaciones historicas exitosas y usarlas como ejemplos
en el system prompt (few-shot prompting) para mejorar la calidad de respuestas.

---

## NOTAS TECNICAS

- El modelo Conversation ya tiene el campo `variables` (Map) listo para captura de datos
- El orchestrator tiene `buildRichContext` con 6 capas, facil de extender con capa 7 (productos)
- Socket room por vendedor: `vendedor:{tenantId}` — ya funciona para escalacion, reutilizable
- Backend: agregar rutas nuevas en server.js siguiendo el patron existente
