/* Dexie.js-based IndexedDB management (professional) */
(function(){
  if (typeof Dexie === 'undefined') {
    console.error('Dexie.js not loaded. The offline store will be unavailable.');
    return;
  }
  const db = new Dexie('agents-pwa');
  db.version(1).stores({ agents: 'email', history: '++id, email' });

  async function getAgents(){ return db.agents.toArray(); }
  async function addOrUpdateAgent({email, restart_hour}){
    const now = new Date().toISOString();
    const existing = await db.agents.get(email);
    const agent = { email, restart_hour, status: 'no disponible', last_update: now };
    if (existing){
      agent.last_update = now;
      await db.agents.put(agent);
    } else {
      await db.agents.add(agent);
    }
    return agent;
  }
  async function updateAgentManual(email, status){
    const old = await db.agents.get(email);
    if (!old) throw new Error('agent not found');
    const oldStatus = old.status;
    old.status = status;
    old.last_update = new Date().toISOString();
    await db.agents.put(old);
    await db.history.add({ email, old_status: oldStatus, new_status: status, change_time: old.last_update, reason: 'manual' });
    return old;
  }
  async function refreshAgent(email, reference_datetime){
    const agent = await db.agents.get(email);
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
      await db.agents.put(agent);
      await db.history.add({ email, old_status: oldStatus, new_status: 'disponible', change_time: agent.last_update, reason: 'automatic refresh' });
      return agent;
    }
    return agent;
  }
  async function getHistory(email){
    if (!email) return db.history.toArray();
    return db.history.where('email').equals(email).toArray();
  }
  async function deleteAgent(email){
    await db.history.where('email').equals(email).delete();
    await db.agents.delete(email);
  }

  // Extend API surface for export/import and seed for testing
  async function exportData(){
    const agents = await db.agents.toArray();
    const history = await db.history.toArray();
    return { agents, history };
  }
  async function importData(data){
    const agents = (data && data.agents) || [];
    const history = (data && data.history) || [];
    // Use a transaction to replace current data
    await db.transaction('rw', db.agents, db.history, async () => {
      await db.agents.clear();
      await db.history.clear();
      if (agents.length) await db.agents.bulkAdd(agents);
      if (history.length) await db.history.bulkAdd(history);
    });
  }
  async function seedIfNeeded(){
    const count = await db.agents.count();
    if (count === 0){
      // Seed a simple sample agent
      const now = new Date().toISOString();
      await db.agents.add({ email: 'seed@example.com', restart_hour: '08:00', status: 'no disponible', last_update: now });
    }
  }
  window.localApi = {
    getAgents, addAgent: addOrUpdateAgent, updateAgentManual, refreshAgent, getHistory, deleteAgent, seedIfNeeded, exportData, importData
  };
})();
