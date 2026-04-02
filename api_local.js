/* ============================================================
   Dexie.js IndexedDB API — Offline Agent Store
   Version: 3.0 (Relational: Directory + Availability/Shifts)
   ============================================================ */
(function () {
  'use strict';

  if (typeof Dexie === 'undefined') {
    console.error('[localApi] Dexie.js not loaded — offline store unavailable.');
    return;
  }

  const DB_NAME = 'agents-pwa';
  const db = new Dexie(DB_NAME);

  // --- Schema Versions ---
  db.version(1).stores({
    agents: 'email',
    history: '++id, email'
  });

  db.version(2).stores({
    agents2: '++id, email',
    history2: '++id, agent_id, email'
  });

  db.version(3).stores({
    directory: '++id, email',
    agents3: '++id, directory_id, status',
    history3: '++id, agent_id',
    // Kept to allow migration from fresh installs or past v2
    agents2: '++id, email',
    history2: '++id, agent_id, email',
    agents: 'email',
    history: '++id, email'
  }).upgrade(async (trans) => {
    // Migration v2 -> v3
    const oldAgents = await trans.table('agents2').toArray();
    const oldHistory = await trans.table('history2').toArray();

    // Directory deduplication logic
    const dirMap = new Map(); // email -> dirId

    for (const a of oldAgents) {
      if (!a.email) continue;
      let dirId;
      if (dirMap.has(a.email)) {
        dirId = dirMap.get(a.email);
      } else {
        dirId = await trans.table('directory').add({
          name: a.name || '',
          email: a.email
        });
        dirMap.set(a.email, dirId);
      }

      const newAgentId = await trans.table('agents3').add({
        directory_id: dirId,
        restart_hour: a.restart_hour || '08:00',
        owner_email: a.owner_email || a.email,
        status: a.status || 'no disponible',
        last_update: a.last_update || new Date().toISOString(),
        start_date: a.start_date || null
      });

      const relatedHistory = oldHistory.filter(h => h.agent_id === a.id);
      for (const h of relatedHistory) {
        await trans.table('history3').add({
          agent_id: newAgentId,
          old_status: h.old_status,
          new_status: h.new_status,
          change_time: h.change_time,
          reason: h.reason || ''
        });
      }
    }
  });

  // --- Helpers ---
  function dirStore() { return db.directory; }
  function store() { return db.agents3; }
  function histStore() { return db.history3; }

  // --- Directory Operations ---

  async function getDirectoryAgents() {
    try {
      return await dirStore().toArray();
    } catch(err) {
      console.error(err);
      return [];
    }
  }

  async function addDirectoryAgent(name, email) {
    if (!email) throw new Error('El correo es requerido.');
    const existing = await dirStore().where('email').equals(email).first();
    if (existing) throw new Error('Este correo ya está registrado en el directorio.');
    
    const dirId = await dirStore().add({ name: name || '', email });
    return { id: dirId, name: name || '', email };
  }

  // --- Availability / Agents Operations ---

  async function getAgents() {
    try {
      const availabilities = await store().toArray();
      const directories = await dirStore().toArray();
      
      const dirIndex = {};
      for (const d of directories) {
        dirIndex[d.id] = d;
      }

      // Join
      return availabilities.map(a => {
        const dir = dirIndex[a.directory_id] || { name: 'Desconocido', email: 'Desconocido' };
        return {
          ...a,
          name: dir.name,
          email: dir.email
        };
      });
    } catch (err) {
      console.error('[localApi] getAgents failed:', err);
      return [];
    }
  }

  async function addAvailability({ directory_id, restart_hour, owner_email, start_date }) {
    if (!directory_id || !restart_hour) {
      throw new Error('Agente y hora de reinicio son requeridos.');
    }
    
    const numDirId = Number(directory_id);
    const dirEntry = await dirStore().get(numDirId);
    if (!dirEntry) throw new Error('Agente no encontrado en el directorio.');

    const now = new Date().toISOString();
    const availability = {
      directory_id: numDirId,
      restart_hour,
      owner_email: (owner_email && owner_email.trim()) || '',
      status: 'no disponible',
      last_update: now,
      start_date: start_date || null
    };

    const id = await store().add(availability);
    
    // Record creation in history
    await histStore().add({
      agent_id: id,
      old_status: 'nuevo',
      new_status: 'no disponible',
      change_time: now,
      reason: 'asignación de disponibilidad'
    });

    return { ...availability, id, name: dirEntry.name, email: dirEntry.email };
  }

  async function updateAgentManual(id, status) {
    const numId = Number(id);
    const agent = await store().get(numId);
    if (!agent) throw new Error('Disponibilidad no encontrada.');

    const oldStatus = agent.status;
    if (oldStatus === status) return agent; 

    agent.status = status;
    agent.last_update = new Date().toISOString();
    await store().put(agent);

    await histStore().add({
      agent_id: numId,
      old_status: oldStatus,
      new_status: status,
      change_time: agent.last_update,
      reason: 'cambio manual'
    });

    return agent;
  }

  async function refreshAgent(id, reference_datetime) {
    const numId = Number(id);
    const agent = await store().get(numId);
    if (!agent) throw new Error('Disponibilidad no encontrada.');

    const ref = new Date(reference_datetime);
    const [hh, mm] = agent.restart_hour.split(':').map(Number);
    const restartDate = new Date(ref);
    restartDate.setHours(hh, mm, 0, 0);

    const lastUp = new Date(agent.last_update);
    const shouldRefresh = ref.toDateString() > lastUp.toDateString() && ref >= restartDate;

    if (shouldRefresh && agent.status !== 'disponible') {
      const oldStatus = agent.status;
      agent.status = 'disponible';
      agent.last_update = ref.toISOString();
      await store().put(agent);

      await histStore().add({
        agent_id: numId,
        old_status: oldStatus,
        new_status: 'disponible',
        change_time: agent.last_update,
        reason: 'reinicio automático'
      });
    }

    return agent;
  }

  async function getHistory(id) {
    if (!id) return await histStore().toArray();
    const numId = Number(id);
    return await histStore().where('agent_id').equals(numId).reverse().sortBy('change_time');
  }

  async function deleteAgent(id) {
    const numId = Number(id);
    await histStore().where('agent_id').equals(numId).delete();
    await store().delete(numId);
  }

  // --- Data Management ---

  async function exportData() {
    return {
      version: 3,
      exported_at: new Date().toISOString(),
      directory: await dirStore().toArray(),
      agents: await store().toArray(),
      history: await histStore().toArray()
    };
  }

  // Simple hard-reset import logic for v3
  async function importData(data) {
    if (!data) throw new Error('Datos inválidos.');
    
    const directories = data.directory || [];
    const agents = data.agents || [];
    const history = data.history || [];

    await db.transaction('rw', dirStore(), store(), histStore(), async () => {
      await dirStore().clear();
      await store().clear();
      await histStore().clear();
      
      if (directories.length) await dirStore().bulkAdd(directories);
      if (agents.length) await store().bulkAdd(agents);
      if (history.length) await histStore().bulkAdd(history);
    });
  }

  async function seedIfNeeded() {
    const count = await dirStore().count();
    if (count === 0) {
      const dirId = await dirStore().add({ name: 'Agente Demo', email: 'demo@ejemplo.com' });
      const now = new Date().toISOString();
      await store().add({
        directory_id: dirId,
        restart_hour: '08:00',
        owner_email: 'demo@ejemplo.com',
        status: 'disponible',
        last_update: now,
        start_date: now
      });
    }
  }

  async function getStats() {
    const agents = await store().toArray();
    const total = agents.length;
    const available = agents.filter(a => a.status === 'disponible').length;
    const unavailable = total - available;
    return { total, available, unavailable };
  }

  // --- Public API ---
  window.localApi = {
    getDirectoryAgents,
    addDirectoryAgent,
    getAgents,
    addAvailability,
    updateAgentManual,
    refreshAgent,
    getHistory,
    deleteAgent,
    exportData,
    importData,
    seedIfNeeded,
    getStats
  };
})();
