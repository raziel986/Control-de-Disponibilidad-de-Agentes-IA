/* Dexie.js-based IndexedDB management (professional) */
(function(){
  if (typeof Dexie === 'undefined') {
    console.error('Dexie.js not loaded. The offline store will be unavailable.');
    return;
  }
  const db = new Dexie('agents-pwa');
  // Version 2 introduces multi-agent-per-email support via new store 'agents2'
  // and a history store 'history2'. We deliberately avoid complex migrations here to
  // prevent data loss; a simple upgrade will migrate in-memory if data exists.
  db.version(2).stores({ agents2: '++id, email', history2: '++id, agent_id, email' });
db.version(2).upgrade((trans) => {
  // No-op migration for now. The complete safe migration to a multi-id-per-email
  // store will be implemented in a dedicated patch (Phase 1) to avoid data loss.
});

  async function getAgents(){
    if (db.agents2 && typeof db.agents2.toArray === 'function') {
      try { return db.agents2.toArray(); } catch { return []; }
    }
    if (db.agents && typeof db.agents.toArray === 'function') {
      try { return db.agents.toArray(); } catch { return []; }
    }
    return [];
  }
  async function addOrUpdateAgent({email, restart_hour, owner_email, name, start_date}){
    const now = new Date().toISOString();
    const owner = (owner_email && owner_email.trim()) || email;
    const agent = { email, restart_hour, owner_email: owner, status: 'no disponible', last_update: now, name, start_date };
    const hasAgents2 = (db.agents2 && typeof db.agents2.add === 'function');
    if (hasAgents2) {
      const id = await db.agents2.add(agent);
      agent.id = id;
    } else {
      const id = await db.agents.add(agent);
      agent.id = id; // may be undefined for older PKs
    }
    return agent;
  }
  async function updateAgentManual(id, status){
    // Update a specific agent by id to support multiple agents per email
    const hasAgents2 = (db.agents2 && typeof db.agents2.get === 'function');
    const store = hasAgents2 ? db.agents2 : db.agents;
    const old = await store.get(id);
    if (!old) throw new Error('agent not found');
    const oldStatus = old.status;
    old.status = status;
    old.last_update = new Date().toISOString();
    await store.put(old);
    const histStore = (db.history2 && typeof db.history2.add === 'function') ? db.history2 : db.history;
    await histStore.add({ agent_id: id, email: old.email, old_status: oldStatus, new_status: status, change_time: old.last_update, reason: 'manual' });
    return old;
  }
  async function refreshAgent(id, reference_datetime){
    const hasAgents2 = (db.agents2 && typeof db.agents2.get === 'function');
    const store = hasAgents2 ? db.agents2 : db.agents;
    const agent = await store.get(id);
    if (!agent) throw new Error('agent not found');
    const ref = new Date(reference_datetime);
    const [hh, mm] = agent.restart_hour.split(':').map(Number);
    const restartDate = new Date(ref);
    restartDate.setHours(hh, mm, 0, 0);
    const lastUp = new Date(agent.last_update);
    const should = ref.toDateString() > lastUp.toDateString() && ref >= restartDate;
    if (should && agent.status !== 'disponible'){
      const oldStatus = agent.status;
      agent.status = 'disponible';
      agent.last_update = ref.toISOString();
      await store.put(agent);
      const histStore = (db.history2 && typeof db.history2.add === 'function') ? db.history2 : db.history;
      await histStore.add({ agent_id: id, email: agent.email, old_status: oldStatus, new_status: 'disponible', change_time: agent.last_update, reason: 'automatic refresh' });
      return agent;
    }
    return agent;
  }
  async function getHistory(id){
    const hasHistory2 = (db.history2 && typeof db.history2.where === 'function');
    if (!id) return hasHistory2 ? db.history2.toArray() : db.history.toArray();
    return hasHistory2 ? db.history2.where('agent_id').equals(id).toArray() : db.history.where('agent_id').equals(id).toArray();
  }
  async function deleteAgent(id){
    const hasHistory2 = (db.history2 && typeof db.history2.where === 'function');
    const histStore = hasHistory2 ? db.history2 : db.history;
    await histStore.where('agent_id').equals(id).delete();
    const hasAgents2 = (db.agents2 && typeof db.agents2.delete === 'function');
    const agentStore = hasAgents2 ? db.agents2 : db.agents;
    await agentStore.delete(id);
  }

  // Extend API surface for export/import and seed for testing
  async function exportData(){
    const hasAgents2 = (db.agents2 && typeof db.agents2.toArray === 'function');
    const hasHistory2 = (db.history2 && typeof db.history2.toArray === 'function');
    const agents = hasAgents2 ? await db.agents2.toArray() : await db.agents.toArray();
    const history = hasHistory2 ? await db.history2.toArray() : await db.history.toArray();
    return { agents, history };
  }
  async function importData(data){
    const agents = (data && data.agents) || [];
    const history = (data && data.history) || [];
    // Use a transaction to replace current data
    await db.transaction('rw', db.agents, db.history, db.agents2, db.history2, async () => {
      if (db.agents) await db.agents.clear();
      if (db.history) await db.history.clear();
      if (db.agents2) await db.agents2.clear();
      if (db.history2) await db.history2.clear();
      if (agents.length) {
        if (db.agents2 && typeof db.agents2.bulkAdd === 'function') {
          await db.agents2.bulkAdd(agents);
        } else {
          await db.agents.bulkAdd(agents);
        }
      }
      if (history.length) {
        if (db.history2 && typeof db.history2.bulkAdd === 'function') {
          await db.history2.bulkAdd(history);
        } else {
          await db.history.bulkAdd(history);
        }
      }
    });
  }
  async function seedIfNeeded(){
    const count = await db.agents.count();
    if (count === 0){
      // Seed a simple sample agent
      const now = new Date().toISOString();
      // Prefer agents2 if available for seeding
      if (db.agents2 && typeof db.agents2.add === 'function') {
        await db.agents2.add({ email: 'seed@example.com', restart_hour: '08:00', owner_email: 'seed@example.com', status: 'no disponible', last_update: now });
      } else {
        await db.agents.add({ email: 'seed@example.com', restart_hour: '08:00', owner_email: 'seed@example.com', status: 'no disponible', last_update: now });
      }
    }
  }
  window.localApi = {
    getAgents, addAgent: addOrUpdateAgent, updateAgentManual, refreshAgent, getHistory, deleteAgent, seedIfNeeded, exportData, importData
    , resetDB
  };
  // Reset offline Dexie DB (for migration/testing Purposes)
  async function resetDB(){
    if (typeof Dexie !== 'undefined') {
      await Dexie.delete('agents-pwa');
      return true;
    }
    return false;
  }
})();
