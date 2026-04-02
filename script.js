"use strict";
/* ============================================================
   Disponibilidad de Agentes — Frontend Controller
   100% Offline via Dexie (IndexedDB) through window.localApi
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM References ---
  const emailInput      = document.getElementById('email');
  const addBtn          = document.getElementById('add-btn');
  const formStatus      = document.getElementById('form-status');

  const modelCheckboxes = document.querySelectorAll('.model-cb');

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

  const seedBtn   = document.getElementById('seed-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');

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

  // --- UI Interactivity ---
  modelCheckboxes.forEach(cb => {
    cb.addEventListener('change', (e) => {
      const parent = cb.closest('.model-row');
      const settings = parent.querySelector('.model-settings');
      if (cb.checked) {
        settings.style.display = 'grid';
        parent.style.borderColor = 'var(--accent)';
      } else {
        settings.style.display = 'none';
        parent.style.borderColor = 'var(--border)';
      }
    });
  });

  // --- Add Assignments ---
  addBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (formStatus) formStatus.textContent = '';
    
    if (!email) { showNotification('El correo es requerido.', 'warning'); emailInput.focus(); return; }
    
    // Collect checked models
    const checkedModels = [];
    modelCheckboxes.forEach(cb => {
      if (cb.checked) {
        const parent = cb.closest('.model-row');
        checkedModels.push({
          model_name: cb.value,
          start_date: parent.querySelector('.model-date').value,
          restart_hour: parent.querySelector('.model-time').value
        });
      }
    });

    if (checkedModels.length === 0) {
      showNotification('Selecciona al menos un modelo de IA.', 'warning');
      return;
    }

    // Validate times
    for (const m of checkedModels) {
      if (!m.restart_hour) {
        showNotification(`Hora de reinicio requerida para ${m.model_name}`, 'warning');
        return;
      }
    }

    addBtn.disabled = true;
    addBtn.textContent = '⏳ Guardando...';
    
    try {
      const numUserId = await window.localApi.createOrGetUser(email);
      let successCount = 0;

      for (const m of checkedModels) {
        try {
          // Normalize start_date
          const sDate = m.start_date ? new Date(m.start_date).toISOString() : null;
          await window.localApi.addAiAssignment(numUserId, m.model_name, m.restart_hour, sDate);
          successCount++;
        } catch (e) {
          showNotification(`Error asignando ${m.model_name}: ${e.message}`, 'error');
        }
      }

      if (successCount > 0) {
        showNotification(`✅ Se asignaron ${successCount} modelos al correo`, 'success');
        // Reset form completely
        emailInput.value = '';
        modelCheckboxes.forEach(cb => {
          cb.checked = false;
          cb.dispatchEvent(new Event('change')); // Trigger hide
        });
        await fetchAgents();
      }
    } catch (err) {
      showNotification(err?.message || 'Error', 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = '💾 Guardar Asignaciones';
    }
  });


  // --- Render Agents Table ---
  function renderAgents(agents, loading = false) {
    tbody.innerHTML = '';

    if (loading) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="loading-text">
            <span class="spinner"></span> Cargando instancias de IA...
          </td>
        </tr>`;
      return;
    }

    if (!agents || agents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-state-icon">🤖</div>
              <div class="empty-state-text">No hay modelos IA asignados.<br>Usa el formulario superior para asignar accesos a un usuario.</div>
            </div>
          </td>
        </tr>`;
      return;
    }

    cachedAgents = agents;

    // Group by email
    const groupedAgents = {};
    agents.forEach(a => {
      const e = a.email || 'Desconocido';
      if (!groupedAgents[e]) groupedAgents[e] = [];
      groupedAgents[e].push(a);
    });

    const sortedEmails = Object.keys(groupedAgents).sort();

    sortedEmails.forEach(email => {
      // 1. Render Group Header
      const groupTr = document.createElement('tr');
      groupTr.style.background = 'var(--surface)';
      groupTr.style.borderTop = '2px solid var(--border)';
      
      groupTr.innerHTML = `<td colspan="7" style="padding: 12px 16px; font-weight: 700; color: var(--accent); text-align: left;">
        👤 ${email}
      </td>`;
      tbody.appendChild(groupTr);

      // 2. Render Models for this Email
      groupedAgents[email].forEach(a => {
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
          <td data-label="Correo (Usuario)" style="padding-left: 2rem;">
            <a href="#" class="agent-email history-link" data-id="${a.id}" aria-label="Ver historial de modelo" style="font-size:0.85rem; color:var(--text-muted);">Ver historial</a>
          </td>
          <td data-label="Modelo de IA"><strong>${a.model_name || '—'}</strong></td>
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
              <button data-id="${a.id}" class="btn btn-ghost btn-sm refresh-btn" aria-label="Actualizar modelo" title="Comprobar reinicio">🔄</button>
              <select data-id="${a.id}" class="force-select" aria-label="Cambiar estado manual">
                <option value="disponible" ${isAvailable ? 'selected' : ''}>Disponible</option>
                <option value="no disponible" ${!isAvailable ? 'selected' : ''}>No disponible</option>
              </select>
              <button data-id="${a.id}" class="btn btn-primary btn-sm force-btn" title="Forzar estado">⚡</button>
              <button data-id="${a.id}" class="btn btn-danger btn-sm delete-btn" title="Remover de este usuario">🗑️</button>
            </div>
          </td>`;
        tbody.appendChild(tr);
      });
    });
  }

  // --- Fetch ---
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
      showNotification('Error cargando datos: ' + (err?.message || err), 'error');
      renderAgents([], false);
    }
  }

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
        historyContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">No hay cambios registrados en este modelo para este usuario.</div></div>';
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

  closeHistoryBtn?.addEventListener('click', () => {
    historySection.style.display = 'none';
  });

  // --- Table Event Delegation ---
  document.querySelector('#agents-table').addEventListener('click', (ev) => {
    const t = ev.target;

    if (t.classList.contains('history-link')) {
      ev.preventDefault();
      const id = t.getAttribute('data-id');
      showHistory(id);
      return;
    }

    if (t.classList.contains('refresh-btn') || t.closest('.refresh-btn')) {
      const btn = t.classList.contains('refresh-btn') ? t : t.closest('.refresh-btn');
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      const nowIso = new Date().toISOString();
      window.localApi?.refreshAgent?.(id, nowIso)
        .then(() => { fetchAgents(); showNotification('Chequeo actualizado', 'success', 2000); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
      return;
    }

    if (t.classList.contains('force-btn') || t.closest('.force-btn')) {
      const btn = t.classList.contains('force-btn') ? t : t.closest('.force-btn');
      const id = btn.getAttribute('data-id');
      const row = btn.closest('tr') || btn.closest('.cell-actions');
      const select = row?.querySelector('.force-select');
      if (!select) return;
      const newStatus = select.value;
      btn.disabled = true;
      window.localApi?.updateAgentManual?.(id, newStatus)
        .then(() => { fetchAgents(); showNotification(`Cambiado a "${newStatus}"`, 'success', 2500); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
      return;
    }

    if (t.classList.contains('delete-btn') || t.closest('.delete-btn')) {
      const btn = t.classList.contains('delete-btn') ? t : t.closest('.delete-btn');
      const id = btn.getAttribute('data-id');
      if (!confirm('¿Eliminar esta instancia de Inteligencia Artificial para este usuario?\nSe borrará su estado y hora.')) return;
      btn.disabled = true;
      window.localApi?.deleteAgent?.(id)
        .then(() => { fetchAgents(); showNotification('Modelo desasignado', 'info', 2500); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
    }
  });

  // --- Actions ---
  refreshAllBtn?.addEventListener('click', async () => {
    refreshAllBtn.disabled = true;
    refreshAllBtn.textContent = '⏳ Evaluando...';
    const nowIso = new Date().toISOString();
    let updated = 0;

    try {
      for (const agent of cachedAgents) {
        const result = await window.localApi.refreshAgent(agent.id, nowIso);
        if (result.status === 'disponible' && agent.status !== 'disponible') updated++;
      }
      await fetchAgents();
      showNotification(`Evaluación terminada. ${updated} modelos habilitados por hora.`, 'success');
    } catch (err) {
      showNotification('Error: ' + (err?.message || err), 'error');
    } finally {
      refreshAllBtn.disabled = false;
      refreshAllBtn.textContent = '🔄 Actualizar Todos';
    }
  });

  seedBtn?.addEventListener('click', async () => {
    try {
      await window.localApi.seedIfNeeded();
      await fetchAgents();
      showNotification('Datos de prueba cargados', 'success');
    } catch (err) {
      showNotification('Error: ' + (err?.message || err), 'error');
    }
  });

  exportBtn?.addEventListener('click', async () => {
    try {
      const data = await window.localApi.exportData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bd_cuentas_ia_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('Exportado correctamente', 'success');
    } catch (err) {
      showNotification('Error: ' + (err?.message || err), 'error');
    }
  });

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
        if (!confirm(`¿Importar ${data.users?.length || 0} usuarios y sus modelos?\nEsto REEMPLAZARÁ la base de datos actual.`)) return;
        await window.localApi.importData(data);
        await fetchAgents();
        showNotification('Importación exitosa', 'success');
      } catch (err) {
        showNotification('Error importando: ' + (err?.message || err), 'error');
      }
    });
    fileInput.click();
  });

  // --- Initial Load ---
  fetchAgents();
});
