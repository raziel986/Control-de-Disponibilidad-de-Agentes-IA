/* ============================================================
   Dexie.js IndexedDB API — Offline Agent Store
   Version: 2.0 (multi-agent-per-email with auto-increment IDs)
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
  // v1: legacy schema (email as PK) — kept for upgrade path
  db.version(1).stores({
    agents: 'email',
    history: '++id, email'
  });

  // v2: multi-agent-per-email with auto-increment IDs
  db.version(2).stores({
    agents2: '++id, email',
    history2: '++id, agent_id, email',
    // Keep legacy tables defined so Dexie can read them during migration
    agents: 'email',
    history: '++id, email'
  }).upgrade(async (trans) => {
    // Migrate v1 → v2: copy existing agents/history to new stores
    const oldAgents = await trans.table('agents').toArray();
    const oldHistory = await trans.table('history').toArray();

    for (const agent of oldAgents) {
      const newId = await trans.table('agents2').add({
        email: agent.email,
        restart_hour: agent.restart_hour || '08:00',
        owner_email: agent.owner_email || agent.email,
        status: agent.status || 'no disponible',
        last_update: agent.last_update || new Date().toISOString(),
        name: agent.name || '',
        start_date: agent.start_date || null
      });
      // Re-link history entries to new agent ID
      const related = oldHistory.filter(h => h.email === agent.email);
      for (const h of related) {
        await trans.table('history2').add({
          agent_id: newId,
          email: h.email,
          old_status: h.old_status,
          new_status: h.new_status,
          change_time: h.change_time,
          reason: h.reason || ''
        });
      }
    }
  });

  // --- Helpers ---
  function store() { return db.agents2; }
  function histStore() { return db.history2; }

  // --- CRUD Operations ---

  async function getAgents() {
    try {
      return await store().toArray();
    } catch (err) {
      console.error('[localApi] getAgents failed:', err);
      return [];
    }
  }

  async function addAgent({ email, restart_hour, owner_email, name, start_date }) {
    if (!email || !restart_hour) {
      throw new Error('Email y hora de reinicio son requeridos.');
    }

    const now = new Date().toISOString();
    const agent = {
      email,
      restart_hour,
      owner_email: (owner_email && owner_email.trim()) || email,
      status: 'no disponible',
      last_update: now,
      name: name || '',
      start_date: start_date || null
    };

    const id = await store().add(agent);
    agent.id = id;

    // Record creation in history
    await histStore().add({
      agent_id: id,
      email,
      old_status: 'nuevo',
      new_status: 'no disponible',
      change_time: now,
      reason: 'registro inicial'
    });

    return agent;
  }

  async function updateAgentManual(id, status) {
    const numId = Number(id);
    const agent = await store().get(numId);
    if (!agent) throw new Error('Agente no encontrado.');

    const oldStatus = agent.status;
    if (oldStatus === status) return agent; // no change needed

    agent.status = status;
    agent.last_update = new Date().toISOString();
    await store().put(agent);

    await histStore().add({
      agent_id: numId,
      email: agent.email,
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
    if (!agent) throw new Error('Agente no encontrado.');

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
        email: agent.email,
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
    const agents = await store().toArray();
    const history = await histStore().toArray();
    return {
      version: 2,
      exported_at: new Date().toISOString(),
      agents,
      history
    };
  }

  async function importData(data) {
    if (!data || !data.agents) {
      throw new Error('Datos inválidos para importar.');
    }
    const agents = data.agents || [];
    const history = data.history || [];

    await db.transaction('rw', store(), histStore(), async () => {
      await store().clear();
      await histStore().clear();
      if (agents.length) await store().bulkAdd(agents);
      if (history.length) await histStore().bulkAdd(history);
    });
  }

  async function seedIfNeeded() {
    const count = await store().count();
    if (count === 0) {
      const now = new Date().toISOString();
      await store().add({
        email: 'demo@ejemplo.com',
        restart_hour: '08:00',
        owner_email: 'demo@ejemplo.com',
        status: 'disponible',
        last_update: now,
        name: 'Agente Demo',
        start_date: now
      });
    }
  }

  async function resetDB() {
    await Dexie.delete(DB_NAME);
    return true;
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
    getAgents,
    addAgent,
    updateAgentManual,
    refreshAgent,
    getHistory,
    deleteAgent,
    exportData,
    importData,
    seedIfNeeded,
    resetDB,
    getStats
  };
})();
