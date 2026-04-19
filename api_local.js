/* ============================================================
   Dexie.js IndexedDB API — Offline Agent Store
   Version: 4.0 (AI Agent Domain Model)
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
  db.version(1).stores({ agents: 'email', history: '++id, email' });
  db.version(2).stores({ agents2: '++id, email', history2: '++id, agent_id, email' });
  db.version(3).stores({
    directory: '++id, email',
    agents3: '++id, directory_id, status',
    history3: '++id, agent_id'
  });

  db.version(4).stores({
    users: '++id, email',
    ai_models: '++id, user_id, status',
    history4: '++id, model_id',
    model_types: '++id, name',
    // Kept to allow migration
    directory: '++id, email',
    agents3: '++id, directory_id, status',
    history3: '++id, agent_id',
    agents2: '++id, email',
    history2: '++id, agent_id, email',
    agents: 'email',
    history: '++id, email'
  }).upgrade(async (trans) => {
    // Migration v3 -> v4
    const oldDirs = await trans.table('directory').toArray();
    const oldAgents = await trans.table('agents3').toArray();
    const oldHistory = await trans.table('history3').toArray();

    // Map old format to new format
    const userMap = new Map(); // email -> userId
    for (const dir of oldDirs) {
      if (!dir.email) continue;
      if (!userMap.has(dir.email)) {
        const userId = await trans.table('users').add({ email: dir.email });
        userMap.set(dir.email, userId);
      }
    }

    for (const a of oldAgents) {
      // Find old directory email to link to new user
      const dirOrigin = oldDirs.find(d => d.id === a.directory_id);
      if (!dirOrigin) continue;
      const uId = userMap.get(dirOrigin.email);
      if (!uId) continue;

      // Ensure model name is carried over, default to 'Genérico' if none existed
      let modelName = 'Modelo Genérico';
      if (a.name) modelName = a.name;

      const newModelId = await trans.table('ai_models').add({
        user_id: uId,
        model_name: modelName,
        restart_hour: a.restart_hour || '08:00',
        status: a.status || 'no disponible',
        last_update: a.last_update || new Date().toISOString(),
        start_date: a.start_date || null
      });

      const relatedHistory = oldHistory.filter(h => h.agent_id === a.id);
      for (const h of relatedHistory) {
        await trans.table('history4').add({
          model_id: newModelId,
          old_status: h.old_status,
          new_status: h.new_status,
          change_time: h.change_time,
          reason: h.reason || ''
        });
      }
    }
  });

  db.version(5).stores({
    model_types: '++id, &name'
  }).upgrade(async (trans) => {
    // Seed default types if upgrading to v5
    const defaults = ['Gemini Pro', 'Gemini Flash', 'Cloude/GPT-OSS', 'Copilot', 'GPT'];
    for (const name of defaults) {
      await trans.table('model_types').add({ name });
    }
  });

  // --- Helpers ---
  function usersStore() { return db.users; }
  function modelsStore() { return db.ai_models; }
  function histStore() { return db.history4; }

  // --- Users ---
  async function createOrGetUser(email) {
    if (!email) throw new Error('El correo es requerido.');
    const existing = await usersStore().where('email').equals(email).first();
    if (existing) return existing.id;
    
    return await usersStore().add({ email });
  }

  // --- AI Models ---

  async function getAgents() {
    try {
      const models = await modelsStore().toArray();
      const users = await usersStore().toArray();
      
      const userIndex = {};
      for (const u of users) {
        userIndex[u.id] = u;
      }

      // Join
      return models.map(m => {
        const user = userIndex[m.user_id] || { email: 'Desconocido' };
        return {
          ...m,
          email: user.email
        };
      });
    } catch (err) {
      console.error('[localApi] getAgents failed:', err);
      return [];
    }
  }

  async function addAiAssignment(user_id, model_name, restart_hour, start_date) {
    if (!user_id || !model_name || !restart_hour) {
      throw new Error('Agente, modelo y hora de reinicio son obligatorios.');
    }
    
    const numId = Number(user_id);
    const userEntry = await usersStore().get(numId);
    if (!userEntry) throw new Error('Usuario no encontrado.');

    // Pre-check to avoid duplicates of the SAME model for the SAME user
    const existingModels = await modelsStore().where({ user_id: numId }).toArray();
    if (existingModels.some(m => m.model_name === model_name)) {
      throw new Error(`El modelo ${model_name} ya está asignado a este correo.`);
    }

    const now = new Date().toISOString();
    const assignment = {
      user_id: numId,
      model_name,
      restart_hour,
      status: 'no disponible',
      last_update: now,
      start_date: start_date || null
    };

    const id = await modelsStore().add(assignment);
    
    // Record creation in history
    await histStore().add({
      model_id: id,
      old_status: 'nuevo',
      new_status: 'no disponible',
      change_time: now,
      reason: 'asignación inicial de modelo'
    });

    return { ...assignment, id, email: userEntry.email };
  }

  async function updateModelSettings(id, restart_hour, start_date) {
    const numId = Number(id);
    const agent = await modelsStore().get(numId);
    if (!agent) throw new Error('Instancia de modelo no encontrada.');

    agent.restart_hour = restart_hour;
    agent.start_date = start_date || null;
    agent.last_update = new Date().toISOString();
    
    await modelsStore().put(agent);

    await histStore().add({
      model_id: numId,
      old_status: agent.status,
      new_status: agent.status,
      change_time: agent.last_update,
      reason: 'actualización de horas/fechas'
    });

    return agent;
  }

  async function updateAgentManual(id, status) {
    const numId = Number(id);
    const agent = await modelsStore().get(numId);
    if (!agent) throw new Error('Instancia de modelo no encontrada.');

    const oldStatus = agent.status;
    if (oldStatus === status) return agent; 

    agent.status = status;
    agent.last_update = new Date().toISOString();
    await modelsStore().put(agent);

    await histStore().add({
      model_id: numId,
      old_status: oldStatus,
      new_status: status,
      change_time: agent.last_update,
      reason: 'cambio manual'
    });

    return agent;
  }

  async function refreshAgent(id, reference_datetime) {
    const numId = Number(id);
    const agent = await modelsStore().get(numId);
    if (!agent) throw new Error('Instancia de modelo no encontrada.');

    const now = new Date(reference_datetime);
    const nowDateStr = now.toISOString().split('T')[0]; // "2026-04-02"

    // Get start date (raw, no timezone shift)
    const startDateStr = agent.start_date ? agent.start_date.split('T')[0] : nowDateStr;

    let shouldBeAvailable = false;

    if (nowDateStr > startDateStr) {
      // Day is past start_date → available regardless of hour
      shouldBeAvailable = true;
    } else if (nowDateStr === startDateStr) {
      // Same day → check if current time >= restart_hour
      const [hh, mm] = agent.restart_hour.split(':').map(Number);
      if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)) {
        shouldBeAvailable = true;
      }
    }

    if (shouldBeAvailable && agent.status !== 'disponible') {
      const oldStatus = agent.status;
      agent.status = 'disponible';
      agent.last_update = now.toISOString();
      await modelsStore().put(agent);

      await histStore().add({
        model_id: numId,
        old_status: oldStatus,
        new_status: 'disponible',
        change_time: agent.last_update,
        reason: 'reinicio automático por fecha/hora cumplida'
      });
    }

    return agent;
  }

  async function getHistory(id) {
    if (!id) return await histStore().toArray();
    const numId = Number(id);
    return await histStore().where('model_id').equals(numId).reverse().sortBy('change_time');
  }

  async function deleteAgent(id) {
    const numId = Number(id);
    await histStore().where('model_id').equals(numId).delete();
    await modelsStore().delete(numId);
  }

  // --- Data Management ---

  async function exportData() {
    return {
      version: 4,
      exported_at: new Date().toISOString(),
      users: await usersStore().toArray(),
      ai_models: await modelsStore().toArray(),
      history: await histStore().toArray()
    };
  }

  async function importData(data) {
    if (!data) throw new Error('Datos inválidos.');
    
    const users = data.users || [];
    const aiModels = data.ai_models || [];
    const history = data.history || [];

    await db.transaction('rw', usersStore(), modelsStore(), histStore(), async () => {
      await usersStore().clear();
      await modelsStore().clear();
      await histStore().clear();
      
      if (users.length) await usersStore().bulkAdd(users);
      if (aiModels.length) await modelsStore().bulkAdd(aiModels);
      if (history.length) await histStore().bulkAdd(history);
    });
  }

  async function seedIfNeeded() {
    const count = await usersStore().count();
    if (count === 0) {
      const uId = await usersStore().add({ email: 'demo@ejemplo.com' });
      const now = new Date().toISOString();
      await modelsStore().add({
        user_id: uId,
        model_name: 'Gemini Pro',
        restart_hour: '08:00',
        status: 'disponible',
        last_update: now,
        start_date: now
      });
      await modelsStore().add({
        user_id: uId,
        model_name: 'Copilot',
        restart_hour: '12:00',
        status: 'no disponible',
        last_update: now,
        start_date: now
      });
    }
  }

  async function getStats() {
    const models = await modelsStore().toArray();
    const total = models.length;
    const available = models.filter(a => a.status === 'disponible').length;
    const unavailable = total - available;
    return { total, available, unavailable };
  }

  // --- Model Types Catalog ---
  async function getModelTypes() {
    return await db.model_types.toArray();
  }

  async function addModelType(name) {
    if (!name) throw new Error('El nombre del modelo es requerido.');
    return await db.model_types.add({ name });
  }

  async function deleteModelType(id) {
    return await db.model_types.delete(Number(id));
  }

  // --- Public API ---
  window.localApi = {
    createOrGetUser,
    addAiAssignment,
    getAgents,
    updateAgentManual,
    updateModelSettings,
    refreshAgent,
    getHistory,
    deleteAgent,
    exportData,
    importData,
    seedIfNeeded,
    getStats,
    getModelTypes,
    addModelType,
    deleteModelType
  };
})();
