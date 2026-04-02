"use strict";
/* ============================================================
   Disponibilidad de Agentes — Frontend Controller
   100% Offline via Dexie (IndexedDB) through window.localApi
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM References ---
  const emailInput      = document.getElementById('email');
  const nameInput       = document.getElementById('agent_name');
  const directorySelect = document.getElementById('directory_id');
  const startDateInput  = document.getElementById('start_date');
  const restartInput    = document.getElementById('restart_hour');
  const ownerEmailInput = document.getElementById('owner_email');
  
  const addDirBtn       = document.getElementById('add-directory-agent');
  const addAvailBtn     = document.getElementById('add-availability');
  
  const dirFormStatus   = document.getElementById('dir-form-status');
  const availFormStatus = document.getElementById('avail-form-status');

  const tbody           = document.querySelector('#agents-table tbody');
  const historySection  = document.getElementById('history-section');
  const historyContent  = document.getElementById('history-content');
  const closeHistoryBtn = document.getElementById('close-history');
  const refreshAllBtn   = document.getElementById('refresh-all-btn');
  const notifContainer  = document.getElementById('notification-container');

  // Stats elements
  const statTotal       = document.getElementById('stat-total');
  const statAvailable   = document.getElementById('stat-available');
  const statUnavailable = document.getElementById('stat-unavailable');

  // Data action buttons
  const seedBtn   = document.getElementById('seed-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');

  // --- State ---
  let cachedAgents = [];

  // --- Notifications ---
  function showNotification(message, type = 'info', duration = 3500) {
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.setAttribute('role', 'alert');
    el.textContent = message;
    notifContainer.appendChild(el);

    setTimeout(() => {
      el.classList.add('notification-exit');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // --- Stats ---
  async function updateStats() {
    if (!window.localApi?.getStats) return;
    try {
      const stats = await window.localApi.getStats();
      animateNumber(statTotal, stats.total);
      animateNumber(statAvailable, stats.available);
      animateNumber(statUnavailable, stats.unavailable);
    } catch (err) {
      console.error('[Stats]', err);
    }
  }

  function animateNumber(el, target) {
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) { el.textContent = target; return; }
    const diff = target - current;
    const steps = Math.min(Math.abs(diff), 15);
    const stepTime = Math.max(30, Math.floor(200 / steps));
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      el.textContent = Math.round(current + diff * progress);
      if (step >= steps) {
        el.textContent = target;
        clearInterval(interval);
      }
    }, stepTime);
  }

  // --- Render Agents Table ---
  function renderAgents(agents, loading = false) {
    tbody.innerHTML = '';

    if (loading) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="loading-text">
            <span class="spinner"></span> Cargando disponibilidades...
          </td>
        </tr>`;
      return;
    }

    if (!agents || agents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-state-icon">📭</div>
              <div class="empty-state-text">No hay turnos registrados.<br>Crea un agente y asígnale disponibilidad arriba.</div>
            </div>
          </td>
        </tr>`;
      return;
    }

    cachedAgents = agents;

    agents.forEach(a => {
      const tr = document.createElement('tr');
      const isAvailable = a.status === 'disponible';
      const statusLabel = isAvailable ? 'Disponible' : 'No disponible';
      const badgeClass = isAvailable ? 'badge-disponible' : 'badge-no-disponible';

      let lastUpdate = '—';
      if (a.last_update) {
        try {
          lastUpdate = new Date(a.last_update).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
        } catch { lastUpdate = a.last_update; }
      }

      let startDate = '—';
      if (a.start_date) {
        try {
          startDate = new Date(a.start_date).toLocaleDateString('es-ES');
        } catch { startDate = ''; }
      }

      tr.innerHTML = `
        <td data-label="Correo">
          <a href="#" class="agent-email history-link" data-id="${a.id}" aria-label="Ver historial">${a.email}</a>
        </td>
        <td data-label="Nombre">${a.name || '—'}</td>
        <td data-label="Fecha Inicio">${startDate}</td>
        <td data-label="Reinicio">${a.restart_hour}</td>
        <td data-label="Estado">
          <span class="badge ${badgeClass}" role="status">
            <span class="badge-dot"></span>
            ${statusLabel}
          </span>
        </td>
        <td data-label="Última Actualización">${lastUpdate}</td>
        <td data-label="Acciones">
          <div class="cell-actions">
            <button data-id="${a.id}" class="btn btn-ghost btn-sm refresh-btn" aria-label="Actualizar agente" title="Actualizar">🔄</button>
            <select data-id="${a.id}" class="force-select" aria-label="Estado">
              <option value="disponible" ${isAvailable ? 'selected' : ''}>Disponible</option>
              <option value="no disponible" ${!isAvailable ? 'selected' : ''}>No disponible</option>
            </select>
            <button data-id="${a.id}" class="btn btn-primary btn-sm force-btn" aria-label="Forzar estado" title="Forzar estado">⚡</button>
            <button data-id="${a.id}" class="btn btn-danger btn-sm delete-btn" aria-label="Eliminar turno" title="Eliminar Turno">🗑️</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // --- Fetch & Render ---
  async function loadDirectory() {
    if (!window.localApi?.getDirectoryAgents || !directorySelect) return;
    try {
      const dirs = await window.localApi.getDirectoryAgents();
      directorySelect.innerHTML = '<option value="">-- Seleccionar agente --</option>';
      dirs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.name || d.email} (${d.email})`;
        directorySelect.appendChild(opt);
      });
    } catch(err) {
      console.error(err);
    }
  }

  async function fetchAgents() {
    renderAgents([], true);
    if (!window.localApi?.getAgents) {
      renderAgents([], false);
      return;
    }
    try {
      const agents = await window.localApi.getAgents();
      renderAgents(Array.isArray(agents) ? agents : []);
      await updateStats();
    } catch (err) {
      console.error('[fetchAgents]', err);
      showNotification('Error cargando agentes: ' + (err?.message || err), 'error');
      renderAgents([], false);
    }
  }

  // --- Add Directory Agent ---
  addDirBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    if (dirFormStatus) dirFormStatus.textContent = '';
    
    if (!email) { showNotification('El correo es requerido.', 'warning'); emailInput.focus(); return; }
    
    addDirBtn.disabled = true;
    addDirBtn.textContent = '⏳ Registrando...';
    try {
      await window.localApi.addDirectoryAgent(name, email);
      emailInput.value = '';
      nameInput.value = '';
      showNotification('✅ Agente agregado al directorio', 'success');
      await loadDirectory();
    } catch (err) {
      showNotification(err?.message || 'Error', 'error');
    } finally {
      addDirBtn.disabled = false;
      addDirBtn.textContent = '➕ Registrar Agente';
    }
  });

  // --- Add Availability Schedule ---
  addAvailBtn?.addEventListener('click', async () => {
    const dirId = directorySelect.value;
    const start = startDateInput.value ? new Date(startDateInput.value).toISOString() : null;
    const restart = restartInput.value.trim();
    const owner = ownerEmailInput.value.trim();
    if (availFormStatus) availFormStatus.textContent = '';

    if (!dirId) { showNotification('Selecciona un agente del directorio', 'warning'); directorySelect.focus(); return; }
    if (!restart) { showNotification('Hora de reinicio requerida', 'warning'); restartInput.focus(); return; }

    addAvailBtn.disabled = true;
    addAvailBtn.textContent = '⏳ Asignando...';
    try {
      await window.localApi.addAvailability({
        directory_id: dirId,
        start_date: start,
        restart_hour: restart,
        owner_email: owner
      });
      startDateInput.value = '';
      restartInput.value = '';
      ownerEmailInput.value = '';
      directorySelect.value = '';
      showNotification('✅ Horario de disponibilidad asignado', 'success');
      await fetchAgents();
    } catch(err) {
      showNotification(err?.message || 'Error', 'error');
    } finally {
      addAvailBtn.disabled = false;
      addAvailBtn.textContent = '📅 Asignar Horario';
    }
  });


  // --- History ---
  function showHistory(id) {
    historyContent.innerHTML = '<div class="loading-text"><span class="spinner"></span> Cargando historial...</div>';
    historySection.style.display = 'block';
    historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (!window.localApi?.getHistory) {
      historyContent.innerHTML = '<div class="empty-state"><div class="empty-state-text">Historial no disponible.</div></div>';
      return;
    }

    window.localApi.getHistory(id).then(hist => {
      if (!hist || hist.length === 0) {
        historyContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">No hay cambios registrados para este turno.</div></div>';
        return;
      }

      historyContent.innerHTML = hist.map(h => {
        let changeTime = h.change_time;
        try {
          changeTime = new Date(h.change_time).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          });
        } catch {}

        const directionClass = h.new_status === 'disponible' ? 'to-disponible' : 'to-no-disponible';

        return `
          <div class="history-item ${directionClass}">
            <div class="history-time">📅 ${changeTime}</div>
            <div class="history-change">
              <span>${h.old_status}</span>
              <span class="arrow">→</span>
              <span><strong>${h.new_status}</strong></span>
            </div>
            <div class="history-reason">Razón: ${h.reason || 'No especificada'}</div>
          </div>`;
      }).join('');

      showNotification('Historial cargado', 'success', 2000);
    }).catch(err => {
      historyContent.innerHTML = '<div class="empty-state"><div class="empty-state-text" style="color:var(--danger)">Error al cargar historial.</div></div>';
      showNotification('Error: ' + (err?.message || err), 'error');
    });
  }

  // --- Close History ---
  closeHistoryBtn?.addEventListener('click', () => {
    historySection.style.display = 'none';
  });

  // --- Table Event Delegation ---
  document.querySelector('#agents-table').addEventListener('click', (ev) => {
    const t = ev.target;

    // History link
    if (t.classList.contains('history-link')) {
      ev.preventDefault();
      const id = t.getAttribute('data-id');
      showHistory(id);
      return;
    }

    // Refresh single agent
    if (t.classList.contains('refresh-btn') || t.closest('.refresh-btn')) {
      const btn = t.classList.contains('refresh-btn') ? t : t.closest('.refresh-btn');
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      const nowIso = new Date().toISOString();
      window.localApi?.refreshAgent?.(id, nowIso)
        .then(() => { fetchAgents(); showNotification('Turno actualizado', 'success', 2000); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
      return;
    }

    // Force status using the select
    if (t.classList.contains('force-btn') || t.closest('.force-btn')) {
      const btn = t.classList.contains('force-btn') ? t : t.closest('.force-btn');
      const id = btn.getAttribute('data-id');
      const row = btn.closest('tr') || btn.closest('.cell-actions');
      const select = row?.querySelector('.force-select');
      if (!select) return;
      const newStatus = select.value;
      btn.disabled = true;
      window.localApi?.updateAgentManual?.(id, newStatus)
        .then(() => { fetchAgents(); showNotification(`Estado cambiado a "${newStatus}"`, 'success', 2500); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
      return;
    }

    // Delete availability
    if (t.classList.contains('delete-btn') || t.closest('.delete-btn')) {
      const btn = t.classList.contains('delete-btn') ? t : t.closest('.delete-btn');
      const id = btn.getAttribute('data-id');
      if (!confirm('¿Estás seguro de eliminar este turno de disponibilidad?\nEl agente seguirá existiendo en el directorio.')) return;
      btn.disabled = true;
      window.localApi?.deleteAgent?.(id)
        .then(() => { fetchAgents(); showNotification('Turno eliminado', 'info', 2500); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
    }
  });

  // --- Refresh All ---
  refreshAllBtn?.addEventListener('click', async () => {
    refreshAllBtn.disabled = true;
    refreshAllBtn.textContent = '⏳ Actualizando...';
    const nowIso = new Date().toISOString();
    let updated = 0;

    try {
      for (const agent of cachedAgents) {
        const result = await window.localApi.refreshAgent(agent.id, nowIso);
        if (result.status === 'disponible' && agent.status !== 'disponible') updated++;
      }
      await fetchAgents();
      showNotification(`Actualización completa. ${updated} agente(s) cambiaron a disponible.`, 'success');
    } catch (err) {
      showNotification('Error: ' + (err?.message || err), 'error');
    } finally {
      refreshAllBtn.disabled = false;
      refreshAllBtn.textContent = '🔄 Actualizar Todos';
    }
  });

  // --- Seed ---
  seedBtn?.addEventListener('click', async () => {
    try {
      await window.localApi.seedIfNeeded();
      await fetchAgents();
      await loadDirectory();
      showNotification('Datos de ejemplo cargados', 'success');
    } catch (err) {
      showNotification('Error: ' + (err?.message || err), 'error');
    }
  });

  // --- Export ---
  exportBtn?.addEventListener('click', async () => {
    try {
      const data = await window.localApi.exportData();
      const json = JSON.stringify(data, null, 2);

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agentes_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showNotification('Datos exportados como archivo JSON', 'success');
    } catch (err) {
      showNotification('Error exportando: ' + (err?.message || err), 'error');
    }
  });

  // --- Import ---
  importBtn?.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!confirm(`¿Importar ${data.directory?.length || 0} agentes y sus disponibilidades?\nEsto reemplazará los datos actuales.`)) return;
        await window.localApi.importData(data);
        await fetchAgents();
        await loadDirectory();
        showNotification('Datos importados correctamente', 'success');
      } catch (err) {
        showNotification('Error importando: ' + (err?.message || err), 'error');
      }
    });
    fileInput.click();
  });

  // --- Initial Load ---
  loadDirectory();
  fetchAgents();
});
