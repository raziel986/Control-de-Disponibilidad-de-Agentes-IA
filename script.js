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

  // --- Form Toggle ---
  const toggleFormBtn   = document.getElementById('toggle-form-btn');
  const addFormSection  = document.getElementById('ai-assignment-form');
  
  toggleFormBtn?.addEventListener('click', () => {
    if (addFormSection.style.display === 'none') {
      addFormSection.style.display = 'block';
      toggleFormBtn.textContent = '❌ Ocultar Asignación';
      toggleFormBtn.classList.replace('btn-primary', 'btn-danger');
    } else {
      addFormSection.style.display = 'none';
      toggleFormBtn.textContent = '➕ Añadir Asignación de IA';
      toggleFormBtn.classList.replace('btn-danger', 'btn-primary');
    }
  });

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
        
        // Auto hide form to demonstrate clean UI
        if (addFormSection && addFormSection.style.display !== 'none') {
            toggleFormBtn.click();
        }

        await fetchAgents();
      }
    } catch (err) {
      showNotification(err?.message || 'Error', 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = '💾 Guardar Asignaciones';
    }
  });


  // --- Render Agents Table (Accordion Style) ---
  function renderAgents(agents, loading = false) {
    tbody.innerHTML = '';

    if (loading) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="loading-text">
            <span class="spinner"></span> Cargando instancias de IA...
          </td>
        </tr>`;
      return;
    }

    if (!agents || agents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
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

    sortedEmails.forEach((email, index) => {
      const groupData = groupedAgents[email];
      const hasAvailable = groupData.some(a => a.status === 'disponible');

      let closestSpan = '';
      if (hasAvailable) {
         closestSpan = '<div style="font-size:0.8rem; font-weight:normal; color:var(--success); margin-top:4px;">Disponibilidad inmediata 🟢</div>';
      } else {
         let closestMs = Infinity;
         let closestStr = '';
         const now = new Date();
         groupData.forEach(a => {
             if (!a.restart_hour) return;
             const [hh, mm] = a.restart_hour.split(':').map(Number);
             let target = new Date();
             target.setHours(hh, mm, 0, 0);
             if (target <= now) {
                target.setDate(target.getDate() + 1);
             }
             const diff = target - now;
             if (diff < closestMs) {
                closestMs = diff;
                closestStr = a.restart_hour;
             }
         });
         if (closestStr) {
             closestSpan = `<div style="font-size:0.8rem; font-weight:normal; color:var(--text-muted); margin-top:4px; margin-left: 20px;">Próxima disponibilidad de un Agente IA: <strong>${closestStr}</strong></div>`;
         }
      }

      // 1. Render Group Header (Accordion Toggle)
      const groupTr = document.createElement('tr');
      groupTr.style.background = 'var(--surface)';
      groupTr.style.borderTop = '2px solid var(--border)';
      groupTr.style.cursor = 'pointer';
      groupTr.classList.add('group-header');
      groupTr.dataset.targetId = `group-${index}`;
      
      groupTr.innerHTML = `<td colspan="6" style="padding: 12px 16px; color: var(--accent); text-align: left;">
        <div style="display:flex; align-items:flex-start;">
          <span class="accordion-icon" style="display:inline-block; transition:transform 0.2s; margin-top:2px; margin-right:8px; font-size: 0.8rem; font-weight: 700;">▶</span>
          <div style="display:flex; flex-direction:column;">
            <div style="font-weight: 700;">
              👤 ${email}
              ${hasAvailable ? '<span title="Usuario con Agentes Activos" style="margin-left:8px; font-size:0.9rem;">🟢</span>' : ''}
            </div>
            ${closestSpan}
          </div>
        </div>
      </td>`;
      tbody.appendChild(groupTr);

      // 2. Render Models for this Email (Collapsed by default)
      groupData.forEach(a => {
        const tr = document.createElement('tr');
        tr.classList.add(`child-of-group-${index}`);
        tr.classList.add('child-model-row');
        tr.style.display = 'none';

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
        const rawDateStr = a.start_date ? a.start_date.split('T')[0] : '';
        if (rawDateStr) {
          const [y, m, d] = rawDateStr.split('-');
          startDate = `${d}/${m}/${y}`;
        }

        tr.innerHTML = `
          <td data-label="Modelo de IA"><strong>${a.model_name || '—'}</strong></td>
          <td data-label="Fecha Inicio" class="td-date" data-raw-date="${rawDateStr}">${startDate}</td>
          <td data-label="Reinicio" class="td-time">${a.restart_hour}</td>
          <td data-label="Estado">
            <span class="badge ${badgeClass}" role="status">
              <span class="badge-dot"></span>
              ${statusLabel}
            </span>
          </td>
          <td data-label="Última Actualización">${lastUpdate}</td>
          <td data-label="Acciones">
            <div class="cell-actions">
              <button data-id="${a.id}" class="btn btn-ghost btn-sm edit-btn" title="Editar Tiempos (En Línea)">✏️</button>
              <button data-id="${a.id}" class="btn btn-ghost btn-sm refresh-btn" aria-label="Actualizar modelo" title="Comprobar reinicio automático">🔄</button>
              <select data-id="${a.id}" class="force-select" aria-label="Cambiar estado manual">
                <option value="disponible" ${isAvailable ? 'selected' : ''}>Disponible</option>
                <option value="no disponible" ${!isAvailable ? 'selected' : ''}>No disponible</option>
              </select>
              <button data-id="${a.id}" class="btn btn-primary btn-sm force-btn" title="Forzar cambio de estado">⚡</button>
              <button data-id="${a.id}" class="btn btn-danger btn-sm delete-btn" title="Remover IA de este usuario">🗑️</button>
            </div>
          </td>`;
        tbody.appendChild(tr);
      });
    });
  }

  // --- Fetch ---
  async function fetchAgents(preserveExpanded = false) {
    // Note: To preserve toggled state, we'd need to track expanded groups. 
    // Right now, it's safer for performance to re-render clean, but could be enhanced later.
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



  // --- Table Event Delegation ---
  document.querySelector('#agents-table').addEventListener('click', async (ev) => {
    const t = ev.target;

    // 1. Accordion Toggle
    const groupHeader = t.closest('.group-header');
    if (groupHeader) {
      const targetId = groupHeader.dataset.targetId;
      const children = tbody.querySelectorAll(`.child-of-${targetId}`);
      const icon = groupHeader.querySelector('.accordion-icon');
      
      const isExpanded = icon.style.transform === 'rotate(90deg)';
      icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
      
      children.forEach(child => {
        child.style.display = isExpanded ? 'none' : 'table-row';
      });
      return;
    }

    // 2. Inline Edit feature
    if (t.classList.contains('edit-btn') || t.closest('.edit-btn')) {
      const btn = t.classList.contains('edit-btn') ? t : t.closest('.edit-btn');
      const tr = btn.closest('tr');
      const id = btn.getAttribute('data-id');
      
      if (tr.classList.contains('editing')) {
        // Save Mode
        const dateInput = tr.querySelector('.inline-date');
        const timeInput = tr.querySelector('.inline-time');
        btn.disabled = true;
        btn.innerHTML = '⏳';
        
        try {
            const sDate = dateInput.value ? new Date(dateInput.value).toISOString() : null;
            await window.localApi.updateModelSettings(id, timeInput.value, sDate);
            showNotification('Ajustes en línea guardados exitosamente', 'success', 2500);
            
            // To be technically robust without losing accordion state, we could just manually rebuild the row cells,
            // but a clean fetchAgents is safer for data integrity.
            await fetchAgents(); 
        } catch (err) {
            showNotification(err.message || 'Error guardando', 'error');
            btn.disabled = false;
            btn.innerHTML = '✔️';
        }
        return;
      }
      
      // Enter edit mode
      tr.classList.add('editing');
      btn.innerHTML = '✔️';
      btn.title = 'Guardar';
      
      const tdDate = tr.querySelector('.td-date');
      const tdTime = tr.querySelector('.td-time');
      const rawD = tdDate.dataset.rawDate || '';
      const rawT = tdTime.textContent.trim();
      
      tdDate.innerHTML = `<input type="date" class="form-input inline-date" value="${rawD}" style="padding:4px; font-size:0.8rem; width:120px; border-radius: var(--radius-sm); border: 1px solid var(--border);"/>`;
      tdTime.innerHTML = `<input type="time" class="form-input inline-time" value="${rawT}" style="padding:4px; font-size:0.8rem; width:100px; border-radius: var(--radius-sm); border: 1px solid var(--border);"/>`;
      return;
    }

    // 4. Manual Refresh
    if (t.classList.contains('refresh-btn') || t.closest('.refresh-btn')) {
      const btn = t.classList.contains('refresh-btn') ? t : t.closest('.refresh-btn');
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      const nowIso = new Date().toISOString();
      window.localApi?.refreshAgent?.(id, nowIso)
        .then(() => { fetchAgents(); showNotification('Verificación manual completada', 'success', 2000); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
      return;
    }

    // 5. Force Dropdown Status Status
    if (t.classList.contains('force-btn') || t.closest('.force-btn')) {
      const btn = t.classList.contains('force-btn') ? t : t.closest('.force-btn');
      const id = btn.getAttribute('data-id');
      const row = btn.closest('tr') || btn.closest('.cell-actions');
      const select = row?.querySelector('.force-select');
      if (!select) return;
      const newStatus = select.value;
      btn.disabled = true;
      window.localApi?.updateAgentManual?.(id, newStatus)
        .then(() => { fetchAgents(); showNotification(`Cambiado forzosamente a "${newStatus}"`, 'success', 2500); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
      return;
    }

    // 6. Delete
    if (t.classList.contains('delete-btn') || t.closest('.delete-btn')) {
      const btn = t.classList.contains('delete-btn') ? t : t.closest('.delete-btn');
      const id = btn.getAttribute('data-id');
      if (!confirm('¿Desasignar y eliminar esta instancia de Inteligencia Artificial para este usuario?\nPerderá todo su historial asociado.')) return;
      btn.disabled = true;
      window.localApi?.deleteAgent?.(id)
        .then(() => { fetchAgents(); showNotification('Modelo IA Removido', 'info', 2500); })
        .catch(err => showNotification('Error: ' + (err?.message || err), 'error'))
        .finally(() => { btn.disabled = false; });
    }
  });

  // --- Global Actions ---
  refreshAllBtn?.addEventListener('click', async () => {
    refreshAllBtn.disabled = true;
    refreshAllBtn.textContent = '⏳ Evaluando...';
    const nowIso = new Date().toISOString();
    let updated = 0;

    try {
      for (const agent of cachedAgents) {
        // Evaluate restart logic globally
        const result = await window.localApi.refreshAgent(agent.id, nowIso);
        if (result.status === 'disponible' && agent.status !== 'disponible') updated++;
      }
      await fetchAgents();
      showNotification(`Evaluación terminada. ${updated} modelos fueron restaurados por su reinicio automático.`, 'success');
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
