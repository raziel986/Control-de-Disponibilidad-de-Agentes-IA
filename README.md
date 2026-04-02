# Disponibilidad de Agentes

Sistema web para gestionar la disponibilidad de agentes de servicio. Permite registrar agentes, actualizar su estado manual o automáticamente, y llevar un historial de cambios.

## Características

- **Gestión de agentes**: Registrar, actualizar y eliminar agentes
- **Estados de disponibilidad**: "Disponible" y "No disponible"
- **Actualización automática**: Los agentes se marcan automáticamente como disponibles después de su hora de reinicio
- **Historial**: Registro de todos los cambios de estado con timestamps y razones
- **Interfaz web**: Frontend responsive con gestión en tiempo real
- **Autostart en Windows**: Configuración automática para iniciar al iniciar sesión

## Requisitos previos

- Python 3.8 o superior
- Windows 10+ (para autostart automático)
- Navegador web moderno

## Instalación

En modo offline 100% (sin backend), puedes servir la app frontend desde un servidor estático local. La app está diseñada para funcionar completamente en el navegador usando Dexie (IndexedDB) y no requiere un backend. Ejemplos:

- Windows/Linux/macOS con Python 3.x:
  - Abre una terminal en la carpeta raíz del repositorio.
  - Si tienes Python instalado, puedes servir la carpeta frontend con: 
    - Python 3: `python -m http.server 8000 --directory frontend`
  - Luego abre http://localhost:8000/index.html o http://localhost:8000/frontend/index.html

- Windows con PowerShell (sin backend):
  - Si prefieres, puedes usar la versión previa del script de instalación para configurar un servidor estático similar. En modo offline, el script lanzará un servidor estático para la carpeta frontend si backend no está presente.

## Uso

### Gestión de agentes

1. **Registrar agente**: Ingresa el correo electrónico y hora de reinicio (formato HH:MM)
2. **Ver agentes**: La tabla muestra todos los agentes con su estado actual
3. **Actualizar estado**: 
   - Botón "Actualizar": Ejecuta la lógica de actualización automática
   - Botón "Forzar" + selector: Cambia manualmente el estado
4. **Ver historial**: Haz clic en el correo electrónico de un agente para ver su historial

### Actualización automática

Los agentes se marcan como "disponible" automáticamente cuando:
- La fecha actual es posterior a la última actualización
- La hora actual es posterior a su hora de reinicio

## Uso (Offline 100%)

La app funciona sin conexión y no depende de un backend. Todo el estado se maneja en el navegador mediante Dexie (IndexedDB).

Notas:
- El flujo de datos se gestiona en el cliente: registrar agentes, actualizar estados y ver historial se guardan en IndexedDB y persisten entre sesiones.
- Si alguna vez hay conectividad de backend en el futuro, este README documentará la opción de sincronización, pero por ahora está desactivada y no es necesaria.

### Export/Import de datos Dexie (opcional)
- Exportar datos actuales desde la consola del navegador:
  - window.localApi.exportData().then(console.log)
- Importar datos desde un snapshot (asumiendo que tienes un objeto similar al export):
  - window.localApi.importData(snapshot)
- Semilla de datos opcional:
  - window.localApi.seedIfNeeded().then(...)

## Estructura del proyecto

```
Disponibilidad de Agentes/
├── frontend/
│   ├── index.html         # Interfaz principal
│   ├── script.js          # Lógica del frontend (offline-first)
│   ├── style.css          # Estilos
│   ├── manifest.json      # PWA manifest
│   └── sw.js              # Service Worker (PWA)
├── frontend/api_local.js   # API local basada en Dexie (offline)
├── scripts/
│   ├── install_windows.ps1  # Script opcional para Windows (offline)
│   └── ...
├── data/                  # Opcional: datos locales (no se usa en offline puro)
├── venv/                  # Entorno virtual (no necesario para offline, puede ignorarse)
├── README.md
```

## Estructura del proyecto

```
Disponibilidad de Agentes/
├── backend/
│   └── server.py          # API REST con Flask
├── frontend/
│   ├── index.html         # Interfaz principal
│   ├── script.js          # Lógica del frontend
│   └── style.css          # Estilos CSS
├── scripts/
│   ├── install_windows.ps1    # Script de instalación Windows
│   └── ...
├── data/                  # Datos de SQLite (se crea automáticamente)
├── venv/                  # Entorno virtual (se crea automáticamente)
├── requirements.txt       # Dependencias Python
└── README.md              # Este archivo
```

## Base de datos (Offline Dexie)

La persistencia de datos se realiza en IndexedDB a través de Dexie (offline-first).

### Stores
- agents: email (PK), restart_hour, status, last_update
- history: id (PK autoincrement), email, old_status, new_status, change_time, reason

## Desarrollo

### Ejecutar en modo desarrollo

```bash
export FLASK_ENV=development  # Linux/Mac
set FLASK_ENV=development     # Windows
python backend/server.py
```

### Tests

```bash
python -m pytest tests/
```

## Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## Soporte

Para problemas o preguntas, abre un issue en: https://github.com/tu-usuario/Disponibilidad-de-Agentes/issues
