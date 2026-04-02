"use strict";
// 100% Offline UI using Dexie (via frontend/api_local.js window.localApi)
document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('email');
  const restartInput = document.getElementById('restart_hour');
  const addBtn = document.getElementById('add-agent');
  const formStatus = document.getElementById('form-status');
  const tbody = document.querySelector('#agents-table tbody');
  const historySection = document.getElementById('history-section');
  const historyContent = document.getElementById('history-content');

  // Notification container (reuse if exists)
  const notificationContainer = document.getElementById('notification-container') || (() => {
    const n = document.createElement('div'); n.id = 'notification-container';
    n.style.cssText = 'position:fixed;top:20px;right:20px;z-index:1000;';
    document.body.appendChild(n); return n;
  })();

  function showNotification(message, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = `padding:12px 16px;margin-bottom:8px;border-radius:4px;background:${type==='success'? '#2ecc71' : type==='error'? '#e74c3c' : type==='warning' ? '#f39c12' : '#3498db'};color:white;box-shadow:0 2px 8px rgba(0,0,0,.15);`;
    notificationContainer.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  function renderAgents(agents, loading = false) {
    tbody.innerHTML = '';
    if (loading) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="text-align:center;padding:40px;">Cargando agentes...</td>`;
      tbody.appendChild(tr);
      return;
    }
    if (!agents || agents.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="text-align:center;padding:40px;color:#7f8c8d;">No hay agentes registrados. Agrega uno.</td>`;
      tbody.appendChild(tr);
      return;
    }
    agents.forEach(a => {
      const tr = document.createElement('tr');
      const statusLabel = a.status === 'disponible' ? 'Disponible' : 'No disponible';
      const badgeClass = a.status === 'disponible' ? 'badge disponible' : 'badge no-disponible';
      let lastUpdateFormatted = 'N/A';
      if (a.last_update) {
        try { lastUpdateFormatted = new Date(a.last_update).toLocaleString('es-ES'); } catch(e) { lastUpdateFormatted = a.last_update; }
      }
      tr.innerHTML = `
        <td><a href="#" data-email="${a.email}" class="history-link" style="color:#3498db;text-decoration:none;">${a.email}</a></td>
        <td>${a.restart_hour}</td>
        <td><span class="${badgeClass}">${statusLabel}</span></td>
        <td>${lastUpdateFormatted}</td>
        <td>
          <button data-email="${a.email}" class="refresh-btn" style="margin-right:4px;">Actualizar</button>
          <button data-email="${a.email}" class="toggle-manual-btn" style="margin-right:4px;">Forzar</button>
          <select data-email="${a.email}" class="force-select" style="margin-right:4px;padding:4px;">
            <option value="disponible">Disponible</option>
            <option value="no disponible">No disponible</option>
          </select>
          <button data-email="${a.email}" class="delete-btn" style="background:#e74c3c;margin-left:4px;">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function fetchAgents(){
    renderAgents([], true);
    if (window.localApi?.getAgents) {
      try {
        const agents = await window.localApi.getAgents();
        renderAgents(agents || []);
      } catch (err) {
        showNotification('Error leyendo agentes offline: ' + (err?.message||err), 'error');
      }
    }
  }

  function showHistory(email) {
    historyContent.innerHTML = '<div class="loading-spinner" style="display:inline-block;"></div> Cargando historial...';
    historySection.style.display = 'block';
    if (window.localApi?.getHistory) {
      window.localApi.getHistory(email).then(hist => {
        if (!hist || hist.length === 0) {
          historyContent.innerHTML = '<div style="color:#7f8c8d;">No hay historial de cambios para este agente.</div>';
        } else {
          historyContent.innerHTML = hist.map(h => {
            let changeTime = h.change_time;
            try { changeTime = new Date(h.change_time).toLocaleString('es-ES'); } catch(e){}
            return `<div style="margin-bottom:8px;padding:8px;background:#f8f9fa;border-left:4px solid ${h.new_status==='disponible'?'#2ecc71':'#e74c3c'};"><strong>${changeTime}</strong><br>${h.old_status} → ${h.new_status}<br><em>Razón: ${h.reason||'No especificada'}</em></div>`;
          }).join('');
        }
        showNotification('Historial cargado correctamente.', 'success', 2000);
      }).catch(err => {
        historyContent.innerHTML = '<div style="color:#e74c3c;">Error al cargar historial.</div>';
        showNotification('Error al cargar historial: ' + (err?.message || err), 'error');
      });
    } else {
      historyContent.innerHTML = '<div style="color:#e74c3c;">Historial no disponible offline.</div>';
    }
  }

  const container = document.querySelector('#agents-table');
  container.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.classList.contains('history-link')) {
      ev.preventDefault();
      showHistory(t.getAttribute('data-email'));
    } else if (t.classList.contains('refresh-btn')) {
      const email = t.getAttribute('data-email'); const btn = t; btn.disabled = true; const nowIso = new Date().toISOString(); window.localApi?.refreshAgent?.(email, nowIso).then(()=> fetchAgents()).catch(err => showNotification('Error: '+ (err?.message||err),'error')).finally(()=>{ btn.disabled=false; });
    } else if (t.classList.contains('toggle-manual-btn')) {
      const email = t.getAttribute('data-email'); const btn = t; const status = prompt('Forzar estado: disponible o no disponible'); if (status === 'disponible' || status === 'no disponible') { btn.disabled = true; window.localApi?.updateAgentManual?.(email, status).then(()=> fetchAgents()).catch(err => showNotification('Error: '+ (err?.message||err),'error')).finally(()=>{ btn.disabled=false; }); }
    } else if (t.classList.contains('delete-btn')) {
      const email = t.getAttribute('data-email'); if (confirm(`¿Está seguro de eliminar al agente ${email}? Esta acción no se puede deshacer.`)) {
        window.localApi?.deleteAgent?.(email).then(()=> fetchAgents()).catch(err => showNotification('Error: '+ (err?.message||err),'error'));
      }
    }
  });

  addBtn.addEventListener('click', () => {
    const email = emailInput.value.trim(); const restart = restartInput.value.trim();
    formStatus.textContent = '';
    if (!email) { showNotification('El correo es requerido.', 'warning'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; if (!emailRegex.test(email)) { showNotification('El correo debe tener un formato válido.', 'warning'); return; }
    if (!restart) { showNotification('La hora de reinicio es requerida.', 'warning'); return; }
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/; if (!timeRegex.test(restart)) { showNotification('La hora debe estar en formato HH:MM (ej: 08:30).', 'warning'); return; }
    window.localApi?.addAgent?.({ email, restart_hour: restart }).then(()=>{ emailInput.value=''; restartInput.value=''; fetchAgents(); }).catch(err => showNotification('Error: '+(err?.message||err),'error'));
  });

  // Initial load
  fetchAgents();

  // Mobile/offline utilities: seed/export/import
  const seedBtn = document.getElementById('seed-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  if (seedBtn) {
    seedBtn.addEventListener('click', async () => {
      try {
        if (window.localApi?.seedIfNeeded) {
          await window.localApi.seedIfNeeded();
          await fetchAgents();
          showNotification('Semilla aplicada (si fue necesaria).', 'success');
        }
      } catch (e) {
        showNotification('Error al sembrar datos: ' + (e?.message || e), 'error');
      }
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        if (window.localApi?.exportData) {
          const data = await window.localApi.exportData();
          const json = JSON.stringify(data, null, 2);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(json);
            alert('Datos exportados y copiados al portapapeles');
          } else {
            prompt('Copie el JSON exportado', json);
          }
        }
      } catch (e) {
        showNotification('Error exportando datos: ' + (e?.message || e), 'error');
      }
    });
  }
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      try {
        const text = prompt('Pega el JSON exportado de Dexie:');
        if (!text) return;
        const data = JSON.parse(text);
        if (window.localApi?.importData) {
          await window.localApi.importData(data);
          await fetchAgents();
          alert('Datos importados correctamente');
        }
      } catch (e) {
        showNotification('Error importando datos: ' + (e?.message || e), 'error');
      }
    });
  }
});
