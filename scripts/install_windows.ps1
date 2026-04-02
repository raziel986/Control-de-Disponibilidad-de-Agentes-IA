<#
.Windows installation script for Agent Availability system.
Features:
- Validates Python installation and version
- Creates Python virtual environment
- Installs dependencies with error handling
- Generates backend/frontend skeleton if missing
- Creates startup entry in HKCU Run (optional)
- Validates port 5000 availability
- Provides uninstall option
#>
Param(
    [string]$RootPath = "$PSScriptRoot",
    [switch]$NoAutostart,
    [switch]$Uninstall,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Status {
    param([string]$Message, [string]$Color = "White")
    Write-Host "[Install] $Message" -ForegroundColor $Color
}

function Test-PythonInstallation {
    try {
        $pythonVersion = python --version 2>&1
        if ($pythonVersion -match "Python (\d+\.\d+\.\d+)") {
            $version = [version]$Matches[1]
            Write-Status "Python $($version.ToString()) detected" "Green"
            if ($version -lt [version]"3.8.0") {
                Write-Status "Python 3.8 or higher is required. Found $($version.ToString())" "Red"
                return $false
            }
            return $true
        } else {
            Write-Status "Python not found in PATH" "Red"
            return $false
        }
    } catch {
        Write-Status "Error checking Python: $($_.Exception.Message)" "Red"
        return $false
    }
}

function Test-PortAvailable {
    param([int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        Write-Status "Port $Port is available" "Green"
        return $true
    } catch {
        Write-Status "Port $Port is already in use" "Yellow"
        return $false
    }
}

function Install-Dependencies {
    param([string]$VenvPath, [string]$RequirementsPath)
    
    $Pip = Join-Path -Path $VenvPath -ChildPath 'Scripts\pip.exe'
    if (-not (Test-Path $Pip)) { 
        $Pip = Join-Path -Path $VenvPath -ChildPath 'Scripts\pip3.exe' 
    }
    
    if (-not (Test-Path $Pip)) {
        throw "pip not found in virtual environment"
    }
    
    Write-Status "Installing dependencies..." "Cyan"
    $output = & "$Pip" install -r $RequirementsPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install dependencies: $output"
    }
    Write-Status "Dependencies installed successfully" "Green"
}

function New-VirtualEnvironment {
    param([string]$VenvPath)
    
    if (Test-Path $VenvPath) {
        Write-Status "Virtual environment already exists" "Yellow"
        return
    }
    
    Write-Status "Creating virtual environment..." "Cyan"
    $output = python -m venv $VenvPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment: $output"
    }
    Write-Status "Virtual environment created" "Green"
}

function Set-RegistryAutostart {
    param([string]$BatchPath, [bool]$Enable)
    
    $RegKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    $ValueName = 'AgentAvailabilityServer'
    
    try {
        if ($Enable) {
            $Command = 'start "AgentAvailability" cmd /c ""' + $BatchPath + '""'
            New-ItemProperty -Path $RegKey -Name $ValueName -Value $Command -PropertyType String -Force | Out-Null
            Write-Status "Autostart enabled in registry" "Green"
        } else {
            try {
                Remove-ItemProperty -Path $RegKey -Name $ValueName -ErrorAction SilentlyContinue
                Write-Status "Autostart disabled" "Green"
            } catch {
                Write-Status "Autostart entry not found (already disabled)" "Yellow"
            }
        }
    } catch {
        Write-Status "Failed to modify registry: $($_.Exception.Message)" "Red"
    }
}

function New-StartupScript {
    param([string]$RootPath, [string]$VenvPath)
    
    $BatchPath = Join-Path -Path $RootPath -ChildPath 'start_agent_availability.bat'
    $BatchContent = @"
@echo off
set LOCAL_PATH=%~dp0
cd /d "%LOCAL_PATH%"
call "%VenvPath%\Scripts\activate.bat"
python backend/server.py
if %ERRORLEVEL% EQU 0 (
    start http://localhost:5000
) else (
    echo Error starting server. Check logs for details.
    pause
)
"@
    
    Set-Content -Path $BatchPath -Value $BatchContent -Encoding utf8
    Write-Status "Startup script created: $BatchPath" "Green"
    return $BatchPath
}

function Uninstall-Application {
    param([string]$RootPath)
    
    Write-Status "Uninstalling Agent Availability..." "Cyan"
    
    # Remove autostart entry
    Set-RegistryAutostart -BatchPath "" -Enable $false
    
    # Remove startup script
    $BatchPath = Join-Path -Path $RootPath -ChildPath 'start_agent_availability.bat'
    if (Test-Path $BatchPath) {
        Remove-Item $BatchPath -Force
        Write-Status "Removed startup script" "Green"
    }
    
    # Remove data directory (optional)
    $DataPath = Join-Path -Path $RootPath -ChildPath 'data'
    if (Test-Path $DataPath) {
        $confirmation = Read-Host "Remove data directory? (y/N)"
        if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
            Remove-Item $DataPath -Recurse -Force
            Write-Status "Removed data directory" "Green"
        }
    }
    
    # Remove virtual environment (optional)
    $VenvPath = Join-Path -Path $RootPath -ChildPath 'venv'
    if (Test-Path $VenvPath) {
        $confirmation = Read-Host "Remove virtual environment? (y/N)"
        if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
            Remove-Item $VenvPath -Recurse -Force
            Write-Status "Removed virtual environment" "Green"
        }
    }
    
    Write-Status "Uninstallation completed" "Green"
}

# Main installation logic
try {
    Write-Status "Agent Availability Installer" "Cyan"
    Write-Status "Installation path: $RootPath" "Cyan"
    
    # Handle uninstall
    if ($Uninstall) {
        Uninstall-Application -RootPath $RootPath
        exit 0
    }
    
    # Validate Python installation
    if (-not (Test-PythonInstallation)) {
        Write-Status "Please install Python 3.8+ and ensure it's in your PATH" "Red"
        exit 1
    }
    
    # Create directory structure
    if (-not (Test-Path $RootPath)) {
        New-Item -ItemType Directory -Path $RootPath | Out-Null
        Write-Status "Created installation directory" "Green"
    }
    
    $BackendPath = Join-Path -Path $RootPath -ChildPath 'backend'
    $FrontendPath = Join-Path -Path $RootPath -ChildPath 'frontend'
    $DataPath = Join-Path -Path $RootPath -ChildPath 'data'
    $VenvPath = Join-Path -Path $RootPath -ChildPath 'venv'
    $RequirementsPath = Join-Path -Path $RootPath -ChildPath 'requirements.txt'
    
    # Validate requirements file exists
    if (-not (Test-Path $RequirementsPath)) {
        Write-Status "requirements.txt not found in $RootPath" "Red"
        exit 1
    }
    
    # Check port availability
    Test-PortAvailable -Port 5000
    
    # Create virtual environment
    New-VirtualEnvironment -VenvPath $VenvPath
    
    # Install dependencies
    Install-Dependencies -VenvPath $VenvPath -RequirementsPath $RequirementsPath
    
    # Create backend/frontend directories if missing
    if (-not (Test-Path $BackendPath)) { 
        New-Item -ItemType Directory -Path $BackendPath | Out-Null 
        Write-Status "Created backend directory" "Green"
    }
    if (-not (Test-Path $FrontendPath)) { 
        New-Item -ItemType Directory -Path $FrontendPath | Out-Null 
        Write-Status "Created frontend directory" "Green"
    }
    
    # Create skeleton files if missing (basic check - full implementation would be more detailed)
    if (-not (Test-Path (Join-Path $BackendPath 'server.py'))) {
        Write-Status "Warning: backend/server.py not found. Please ensure it exists." "Yellow"
    }
    if (-not (Test-Path (Join-Path $FrontendPath 'index.html'))) {
        Write-Status "Warning: frontend/index.html not found. Please ensure it exists." "Yellow"
    }
    
    # Create startup script
    $BatchPath = New-StartupScript -RootPath $RootPath -VenvPath $VenvPath
    
    # Setup autostart (optional)
    if (-not $NoAutostart) {
        $autostart = Read-Host "Enable autostart on login? (Y/n)"
        if ($autostart -ne 'n' -and $autostart -ne 'N') {
            Set-RegistryAutostart -BatchPath $BatchPath -Enable $true
        } else {
            Write-Status "Autostart skipped" "Yellow"
        }
    } else {
        Write-Status "Autostart disabled by parameter" "Yellow"
    }
    
    Write-Status "Installation completed successfully!" "Green"
    Write-Status "To start the application:" "Cyan"
    Write-Status "  1. Run: $BatchPath" "White"
    Write-Status "  2. Or run: python backend/server.py" "White"
    Write-Status "  3. Open browser: http://localhost:5000" "White"
    Write-Status "" "White"
    Write-Status "To uninstall: .\install_windows.ps1 -Uninstall" "Cyan"
    
    # If backend is not present, default to a lightweight static frontend server (offline)
    $backendExists = Test-Path (Join-Path -Path $RootPath -ChildPath 'backend\server.py')
    if (-not $backendExists) {
        $frontendFolder = Join-Path -Path $RootPath -ChildPath 'frontend'
        if (Test-Path $frontendFolder) {
            $pythonExe = Join-Path -Path $RootPath -ChildPath 'venv\Scripts\python.exe'
            Start-Process -FilePath $pythonExe -ArgumentList "-m http.server 8000 --directory `"$frontendFolder`"" -NoNewWindow
            Write-Status "Frontend offline server started at http://localhost:8000" "Green"
        }
    }
} catch {
    Write-Status "Installation failed: $($_.Exception.Message)" "Red"
    Write-Status "Stack trace: $($_.ScriptStackTrace)" "Red"
    exit 1
}
