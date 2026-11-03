# Sky Ticket

MVP de gestión de tickets para Sky Soluciones. Incluye panel web, API para agentes, PostgreSQL y despliegue Docker.

## Inicio

```bash
cp .env.example .env
# Cambiar POSTGRES_PASSWORD, JWT_SECRET y SEED_ADMIN_PASSWORD.
docker compose up --build
```

- Aplicación: http://localhost:3000
- API: http://localhost:3001/api
- Swagger: http://localhost:3001/api/docs
- OpenAPI para agentes: http://localhost:3001/api/openapi.json

El seed crea el administrador definido por `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`.

## Agentes

Un administrador crea una credencial desde `POST /api/api-clients`. La respuesta muestra `apiKey` una sola vez. El agente envía:

```http
X-API-Key: sky_...
```

Las API keys tienen rol `ADMIN` o `ASSISTANT`, pueden revocarse y dejan atribución en el historial. El rol técnico queda ligado a una persona y sus tickets asignados. Nunca incluya claves en prompts, repositorios o logs.

## WispHub

Un administrador configura la integración en `Configuración > Integraciones`:

1. URL: `https://api.wisphub.net/api/`
2. API key con permiso **Lista de Clientes**.
3. Probar conexión y activar.

Al crear un ticket, administradores y asistentes pueden buscar por IP. Sky Ticket consulta `GET /api/clientes/?ip=...`, completa nombre, teléfono, documento, correo, dirección, plan y ubicación. La API key queda cifrada con `WISPHUB_ENCRYPTION_KEY`; nunca se devuelve al frontend.

Ejemplo:

```bash
curl http://localhost:3001/api/tickets \
  -H 'X-API-Key: sky_...'
```

## Permisos

| Función | Administrador | Asistente | Líder de equipo | Técnico |
| --- | --- | --- | --- | --- |
| Gestionar usuarios/agentes/categorías | Sí | No | No | No |
| Configurar empresa y motivos | Sí | No | No | No |
| Crear y asignar tickets | Sí | Sí | No | No |
| Organizar cuadrillas diarias | Sí | Consulta | Sí | Consulta propia |
| Ver tickets | Todos | Todos | Todos | Propios y de cuadrilla |
| Cambiar estado | Todos | Todos | No | Propios y de cuadrilla |
| Editar cliente/ticket | Sí | Sí | No | No |

Los asistentes solo reciben desde la API la lista mínima de técnicos activos necesaria para asignar tickets. No pueden listar empleados, administrar accesos, crear agentes ni leer/modificar configuración sensible.

## Flujo

```text
PENDIENTE <-> EN CURSO <-> REALIZADO
```

Los estados se cambian manualmente. Asignar técnico o cuadrilla no altera el avance. Solo administración puede reabrir un ticket realizado.

## Comandos

```bash
npm install
npm run build
npm test
npm run lint
```

Migraciones se ejecutan automáticamente al iniciar `api`. PostgreSQL usa volumen persistente `postgres_data`.

## Alcance aplazado

Fotos, firma, geolocalización, trabajo offline y notificaciones quedan fuera de esta versión.
