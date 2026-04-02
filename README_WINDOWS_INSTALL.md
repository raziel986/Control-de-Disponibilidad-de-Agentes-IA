Agent Availability – Inicio rápido en Windows

Resumen
- Backend en Python con Flask usando SQLite para persistencia.
- Frontend HTML/CSS/JS simple para gestionar agentes y su estado.
- Script de instalación para Windows que crea un entorno aislado, instala dependencias, genera un script de inicio en Startup y lanza la app en http://localhost:5000.

Requisitos previos
- Windows 10 o superior
- Python 3.8 o superior instalado (recomendado agregar a PATH)
- Acceso de usuario para modificar Run keys (no requiere privilegios de administrador para HKCU)

Estructura de archivos nueva (en el repositorio):
- backend/server.py: API REST con Flask
- data/ (carpeta de datos para SQLite; se crea automáticamente)
- frontend/index.html, frontend/script.js, frontend/style.css: interfaz web
- requirements.txt: dependencias Python
- scripts/install_windows.ps1: script de instalación de Windows
- README_WINDOWS_INSTALL.md: esta guía

Guía de instalación (resumen)
1) Copia el repositorio en una carpeta deseada, por ejemplo C:\DisponibilidadAgentes
2) Abre PowerShell como administrador y ejecuta: 
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   & "C:\path\to\repo\scripts\install_windows.ps1" -RootPath "C:\DisponibilidadAgentes"
   Nota: ajusta la ruta al repositorio en el comando anterior.
3) El script crea un entorno virtual, instala dependencias, genera un script de inicio en Startup y registra la ejecución al inicio.
4) Revisa http://localhost:5000 en tu navegador. La app debería abrirse automáticamente al iniciar sesión, mostrando la interfaz.

Notas
- El inicio automático se realiza mediante una entrada Run del registro de HKCU. Si desactivas el autostart, deberás eliminar la entrada manualmente.
- El script de instalación es un punto de partida. Dependiendo de tu entorno, puede requerir ajustes (Rutas, permisos, versión de Python).
- Para desinstalar, deberás eliminar las entradas de Run y eliminar el batch creado, así como la carpeta de datos.
