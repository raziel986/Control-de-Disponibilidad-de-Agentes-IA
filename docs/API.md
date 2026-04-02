# API Documentation - Disponibilidad de Agentes

## Base URL
```
http://localhost:5000
```

## Authentication
No authentication required for this API.

## Endpoints

### Health Check
**GET** `/health`

Verifica el estado del servidor.

**Response:**
```json
{
  "status": "ok"
}
```

---

### Agents Management

#### Get All Agents
**GET** `/api/agents`

Obtiene la lista de todos los agentes registrados.

**Response:**
```json
[
  {
    "email": "agente@empresa.com",
    "restart_hour": "08:00",
    "status": "disponible",
    "last_update": "2026-04-02T10:30:00"
  }
]
```

#### Create Agent
**POST** `/api/agents`

Registra un nuevo agente en el sistema.

**Request Body:**
```json
{
  "email": "agente@empresa.com",
  "restart_hour": "08:00"
}
```

**Response (Success):**
```json
{
  "email": "agente@empresa.com",
  "restart_hour": "08:00",
  "status": "no disponible"
}
```

**Response (Error):**
```json
{
  "error": "email and restart_hour required"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad request (missing or invalid parameters)

#### Update Agent Status (Manual)
**PUT** `/api/agents/{email}/manual`

Actualiza manualmente el estado de un agente.

**URL Parameters:**
- `email` - Correo electrónico del agente

**Request Body:**
```json
{
  "status": "disponible"
}
```

**Valid Status Values:**
- `"disponible"` - Agente disponible
- `"no disponible"` - Agente no disponible

**Response:**
```json
{
  "email": "agente@empresa.com",
  "status": "disponible"
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid status value
- `404` - Agent not found

#### Refresh Agent Status (Automatic)
**POST** `/api/agents/{email}/refresh`

Ejecuta la lógica de actualización automática para un agente.

**URL Parameters:**
- `email` - Correo electrónico del agente

**Request Body:**
```json
{
  "reference_datetime": "2026-04-02T10:30:00"
}
```

**Response:**
```json
{
  "email": "agente@empresa.com",
  "restart_hour": "08:00",
  "status": "disponible",
  "last_update": "2026-04-02T10:30:00"
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid datetime format or computation error
- `404` - Agent not found

#### Delete Agent
**DELETE** `/api/agents/{email}`

Elimina un agente y su historial del sistema.

**URL Parameters:**
- `email` - Correo electrónico del agente

**Response:**
```json
{
  "message": "agent deleted",
  "email": "agente@empresa.com"
}
```

**Status Codes:**
- `200` - Success
- `404` - Agent not found
- `500` - Server error during deletion

---

### History

#### Get Agent History
**GET** `/api/agents/{email}/history`

Obtiene el historial de cambios de estado de un agente.

**URL Parameters:**
- `email` - Correo electrónico del agente

**Query Parameters:**
- `download=csv` (optional) - Descarga el historial en formato CSV

**Response (JSON):**
```json
[
  {
    "id": 1,
    "email": "agente@empresa.com",
    "old_status": "no disponible",
    "new_status": "disponible",
    "change_time": "2026-04-02T10:30:00",
    "reason": "manual"
  }
]
```

**Response (CSV):**
```csv
change_time,old_status,new_status,reason
2026-04-02T10:30:00,no disponible,disponible,manual
```

**Status Codes:**
- `200` - Success

---

### Configuration

#### Autostart Configuration
**POST** `/config/autostart`

Configura el inicio automático del servidor al iniciar sesión (solo Windows).

**Request Body:**
```json
{
  "enable": true
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Autostart enabled."
}
```

**GET** `/config/autostart`

Obtiene el estado actual de la configuración de autostart.

**Response:**
```json
{
  "autostart": "unknown (depends on OS and registry)"
}
```

**Status Codes:**
- `200` - Success

---

## Error Handling

All error responses follow this format:
```json
{
  "error": "Error description"
}
```

### Common HTTP Status Codes
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

## Data Models

### Agent
```json
{
  "email": "string (primary key)",
  "restart_hour": "string (HH:MM format)",
  "status": "string ('disponible' or 'no disponible')",
  "last_update": "string (ISO 8601 datetime)"
}
```

### History Record
```json
{
  "id": "integer (auto-increment)",
  "email": "string (foreign key to agents)",
  "old_status": "string",
  "new_status": "string",
  "change_time": "string (ISO 8601 datetime)",
  "reason": "string (optional)"
}
```

## Examples

### Complete Workflow Example

1. **Register an agent:**
```bash
curl -X POST http://localhost:5000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"email": "agent1@company.com", "restart_hour": "09:00"}'
```

2. **Get all agents:**
```bash
curl http://localhost:5000/api/agents
```

3. **Update status manually:**
```bash
curl -X PUT http://localhost:5000/api/agents/agent1@company.com/manual \
  -H "Content-Type: application/json" \
  -d '{"status": "disponible"}'
```

4. **Refresh status automatically:**
```bash
curl -X POST http://localhost:5000/api/agents/agent1@company.com/refresh \
  -H "Content-Type: application/json" \
  -d '{"reference_datetime": "2026-04-02T10:00:00"}'
```

5. **Get history:**
```bash
curl http://localhost:5000/api/agents/agent1@company.com/history
```

6. **Download history as CSV:**
```bash
curl "http://localhost:5000/api/agents/agent1@company.com/history?download=csv" --output history.csv
```

7. **Delete agent:**
```bash
curl -X DELETE http://localhost:5000/api/agents/agent1@company.com
```

## Rate Limiting
No rate limiting implemented in the current version.

## CORS
CORS is not configured. For production use, consider adding CORS headers.