# Disponibilidad de Agentes

Sistema PWA 100% offline para gestionar la disponibilidad de agentes de servicio. Permite registrar agentes, actualizar su estado manual o automáticamente, y llevar un historial completo de cambios.

## Características

- **100% Offline**: Todo funciona en el navegador usando IndexedDB (Dexie.js empaquetado localmente)
- **Gestión de agentes**: Registrar, actualizar y eliminar agentes con validación de duplicados
- **Estados de disponibilidad**: "Disponible" y "No disponible" con badges visuales
- **Actualización automática**: Los agentes se marcan como disponibles después de su hora de reinicio
- **Historial**: Registro completo de todos los cambios con timestamps y razones
- **Dashboard**: Panel de estadísticas en tiempo real (total, disponibles, no disponibles)
- **Export/Import**: Respaldo y restauración de datos vía archivos JSON
- **PWA instalable**: Se puede instalar como app nativa en Android, iOS y escritorio
- **Responsive**: Interfaz adaptable a móvil, tablet y escritorio
- **Accesible**: Soporte para lectores de pantalla y navegación por teclado

## Requisitos

- Navegador web moderno (Chrome, Firefox, Edge, Safari)
- Para servir localmente: Python 3.x o cualquier servidor HTTP estático

## Instalación y Uso

### Opción 1: Servidor local con Python

```bash
# Navega a la carpeta del proyecto
cd "Disponibilidad de Agentes"

# Inicia un servidor estático
python -m http.server 8000

# Abre http://localhost:8000 en tu navegador
```

### Opción 2: Abrir directamente

Abre `index.html` directamente en el navegador. Nota: el Service Worker solo funciona con un servidor HTTP.

## Uso

### Registrar un agente

1. Completa el formulario con nombre, correo, fecha de inicio y hora de reinicio
2. Haz clic en **Registrar**
3. El agente aparecerá en la tabla con estado "No disponible"

### Actualizar estado

- **🔄 Actualizar**: Ejecuta la lógica automática (cambia a disponible si la hora de reinicio ya pasó)
- **⚡ Forzar**: Cambia el estado al valor seleccionado en el dropdown
- **🔄 Actualizar Todos**: Ejecuta la lógica automática en todos los agentes

### Ver historial

Haz clic en el correo de un agente para ver su historial de cambios.

### Export/Import

- **📤 Exportar**: Descarga un archivo JSON con todos los datos
- **📥 Importar**: Restaura datos desde un archivo JSON exportado previamente
- **🌱 Semilla**: Carga un agente de ejemplo para pruebas

## Estructura del Proyecto

```
Disponibilidad de Agentes/
├── index.html          # Interfaz principal (HTML semántico + PWA setup)
├── script.js           # Controlador frontend (gestión de estado y UI)
├── style.css           # Sistema de diseño completo (Light Navy theme)
├── api_local.js        # API offline con Dexie.js (IndexedDB)
├── sw.js               # Service Worker (cache-first strategy)
├── manifest.json       # Manifiesto PWA
├── lib/
│   └── dexie.min.js    # Dexie.js v3 empaquetado localmente
├── icons/
│   ├── icon-192.svg    # Icono PWA 192x192
│   └── icon-512.svg    # Icono PWA 512x512
└── README.md           # Este archivo
```

## Base de Datos (IndexedDB via Dexie)

### Stores

| Store | Campos | Descripción |
|-------|--------|-------------|
| `agents2` | `++id`, `email`, `name`, `restart_hour`, `owner_email`, `status`, `last_update`, `start_date` | Agentes registrados |
| `history2` | `++id`, `agent_id`, `email`, `old_status`, `new_status`, `change_time`, `reason` | Historial de cambios |

### API (`window.localApi`)

| Método | Descripción |
|--------|-------------|
| `getAgents()` | Obtiene todos los agentes |
| `addAgent({...})` | Registra un nuevo agente (valida unicidad de email) |
| `updateAgentManual(id, status)` | Cambia estado manualmente |
| `refreshAgent(id, datetime)` | Aplica lógica de reinicio automático |
| `getHistory(id?)` | Obtiene historial (de un agente o todos) |
| `deleteAgent(id)` | Elimina agente y su historial |
| `getStats()` | Retorna {total, available, unavailable} |
| `exportData()` | Exporta todos los datos como JSON |
| `importData(data)` | Importa datos desde JSON |
| `seedIfNeeded()` | Crea agente de ejemplo si la DB está vacía |
| `resetDB()` | Elimina toda la base de datos |

## Licencia

Este proyecto está bajo la Licencia MIT.
