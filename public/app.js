// API Base URL
const API_URL = ''; // Relative path, same host

// Global state
let currentView = 'dashboard';
let channels = [];
let messages = [];
let schedulers = [];
let selectedWeekdays = [1, 2, 3, 4, 5, 6, 0]; // Default all days

// View switching logic
function switchView(viewName) {
  currentView = viewName;
  
  // Update sidebar active classes
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const navItems = Array.from(document.querySelectorAll('.nav-item'));
  const activeItem = navItems.find(item => 
    item.getAttribute('onclick').includes(viewName)
  );
  if (activeItem) activeItem.classList.add('active');
  
  // Show active section
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const viewSection = document.getElementById(`view-${viewName}`);
  if (viewSection) viewSection.classList.add('active');

  // Update header titles
  const titles = {
    dashboard: { title: 'Dashboard', sub: 'Resumo estatístico do sistema e conexões.' },
    settings: { title: 'Configurações de API WhatsApp', sub: 'Gerencie as chaves e rotas da sua API externa de WhatsApp.' },
    channels: { title: 'Grupos e Canais', sub: 'Gerencie os canais de destino de suas mensagens.' },
    messages: { title: 'Mensagens Cadastradas', sub: 'Modelos de textos para os disparos automáticos.' },
    scheduler: { title: 'Cronograma de Envio', sub: 'Configure horários e dias específicos para seus disparos.' },
    logs: { title: 'Histórico de Disparos', sub: 'Acompanhe todos os disparos efetuados pelo sistema.' }
  };
  
  if (titles[viewName]) {
    document.getElementById('view-title').innerText = titles[viewName].title;
    document.getElementById('view-subtitle').innerText = titles[viewName].sub;
  }

  // Load specific data on tab change
  if (viewName === 'dashboard') {
    loadDashboardStats();
  } else if (viewName === 'settings') {
    loadSettings();
  } else if (viewName === 'channels') {
    loadChannels();
  } else if (viewName === 'messages') {
    loadMessages();
  } else if (viewName === 'scheduler') {
    loadSchedulerData();
  } else if (viewName === 'logs') {
    loadLogs();
  }
}

// Modal handling
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
  if (modalId === 'modal-scheduler') {
    populateSchedulerDropdowns();
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Toggle Specific Fields in Channel Form
function toggleChannelInputs() {
  const type = document.getElementById('channel-type').value;
  document.querySelectorAll('.type-specific-fields').forEach(el => {
    el.style.display = 'none';
  });
  
  if (type === 'whatsapp_group') {
    document.getElementById('fields-whatsapp').style.display = 'block';
    document.getElementById('channel-wa-id').required = true;
  } else if (type === 'telegram') {
    document.getElementById('fields-telegram').style.display = 'block';
    document.getElementById('channel-wa-id').required = false;
  } else if (type === 'discord') {
    document.getElementById('fields-discord').style.display = 'block';
    document.getElementById('channel-wa-id').required = false;
  } else if (type === 'webhook') {
    document.getElementById('fields-webhook').style.display = 'block';
    document.getElementById('channel-wa-id').required = false;
  }
}

// Weekday selector interaction
document.querySelectorAll('#sched-weekdays .weekday-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const day = parseInt(btn.getAttribute('data-day'));
    if (btn.classList.contains('active')) {
      if (selectedWeekdays.length > 1) {
        btn.classList.remove('active');
        selectedWeekdays = selectedWeekdays.filter(d => d !== day);
      }
    } else {
      btn.classList.add('active');
      selectedWeekdays.push(day);
    }
  });
});

function resetWeekdays() {
  selectedWeekdays = [1, 2, 3, 4, 5, 6, 0];
  document.querySelectorAll('#sched-weekdays .weekday-btn').forEach(btn => {
    btn.classList.add('active');
  });
}

// Fetch and Render Data Functions

// 1. Dashboard Stats
async function loadDashboardStats() {
  try {
    const res = await fetch(`${API_URL}/api/stats`);
    const stats = await res.json();
    
    document.getElementById('stat-active-scheds').innerText = stats.activeScheds;
    document.getElementById('stat-sent-count').innerText = stats.sentCount;
    document.getElementById('stat-success-rate').innerText = stats.successRate + '%';
    
    updateWhatsAppBadge(stats.waStatus);
  } catch (err) {
    console.error('Erro ao buscar estatísticas do Dashboard', err);
  }
}

// Global WhatsApp Status Badge Updater
function updateWhatsAppBadge(status) {
  const badgeGlobal = document.getElementById('global-wa-badge');
  const textGlobal = document.getElementById('global-wa-status');
  
  const badgeLocal = document.getElementById('settings-status-badge');
  const textLocal = document.getElementById('settings-status-text');
  
  let label = 'WhatsApp Sem API';
  let isConnected = false;
  
  if (status === 'connected') {
    label = 'WhatsApp API Ativa';
    isConnected = true;
  } else {
    label = 'WhatsApp API Inativa';
    isConnected = false;
  }
  
  // Set badge classes
  if (isConnected) {
    badgeGlobal.classList.add('connected');
    badgeGlobal.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
    badgeGlobal.style.color = 'var(--color-success)';
    badgeGlobal.style.borderColor = 'rgba(16, 185, 129, 0.2)';
    textGlobal.innerText = label;
    
    if (badgeLocal) {
      badgeLocal.classList.add('connected');
      badgeLocal.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
      badgeLocal.style.color = 'var(--color-success)';
      badgeLocal.style.borderColor = 'rgba(16, 185, 129, 0.2)';
      textLocal.innerText = label;
    }
  } else {
    badgeGlobal.classList.remove('connected');
    badgeGlobal.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
    badgeGlobal.style.color = 'var(--color-danger)';
    badgeGlobal.style.borderColor = 'rgba(239, 68, 68, 0.2)';
    textGlobal.innerText = label;
    
    if (badgeLocal) {
      badgeLocal.classList.remove('connected');
      badgeLocal.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
      badgeLocal.style.color = 'var(--color-danger)';
      badgeLocal.style.borderColor = 'rgba(239, 68, 68, 0.2)';
      textLocal.innerText = label;
    }
  }
}

// 2. Settings Management (API WhatsApp Externa)
async function loadSettings() {
  try {
    const res = await fetch(`${API_URL}/api/settings`);
    const settings = await res.json();
    
    document.getElementById('settings-wa-url').value = settings.waApiUrl || '';
    document.getElementById('settings-wa-token').value = settings.waApiToken || '';
    
    const waStatus = (settings.waApiUrl && settings.waApiToken) ? 'connected' : 'disconnected';
    updateWhatsAppBadge(waStatus);
  } catch (err) {
    console.error('Erro ao buscar configurações', err);
  }
}

async function saveSettingsForm(event) {
  event.preventDefault();
  
  const waApiUrl = document.getElementById('settings-wa-url').value;
  const waApiToken = document.getElementById('settings-wa-token').value;
  const saveBtn = document.getElementById('btn-save-settings');
  
  saveBtn.disabled = true;
  saveBtn.innerText = 'Salvando...';
  
  try {
    const res = await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waApiUrl, waApiToken })
    });
    
    if (res.ok) {
      const data = await res.json();
      alert('Configurações salvas com sucesso!');
      loadSettings();
    } else {
      alert('Erro ao salvar as configurações.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão ao salvar.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = 'Salvar Configurações';
  }
}

// 3. Channels CRUD
async function loadChannels() {
  try {
    const res = await fetch(`${API_URL}/api/channels`);
    channels = await res.json();
    
    const list = document.getElementById('channels-list');
    if (channels.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <h3>Nenhum destino cadastrado</h3>
          <p>Cadastre grupos do WhatsApp, canais de Telegram ou Webhooks do Discord.</p>
        </div>`;
      return;
    }
    
    list.innerHTML = '';
    channels.forEach(ch => {
      const badges = {
        whatsapp_group: '<span class="badge badge-wa">WhatsApp</span>',
        telegram: '<span class="badge badge-tg">Telegram</span>',
        discord: '<span class="badge badge-dc">Discord</span>',
        webhook: '<span class="badge badge-webhook">Webhook</span>'
      };
      
      const item = document.createElement('div');
      item.className = 'list-item';
      
      let details = '';
      if (ch.type === 'whatsapp_group') details = `Chat ID: ${ch.chatId}`;
      else if (ch.type === 'telegram') details = `Chat ID: ${ch.chatId}`;
      else if (ch.type === 'discord') details = 'Webhook URL configurada';
      else if (ch.type === 'webhook') details = `${ch.method} ${ch.url}`;

      item.innerHTML = `
        <div class="list-item-content">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="list-item-title">${escapeHTML(ch.name)}</span>
            ${badges[ch.type]}
          </div>
          <span class="list-item-subtitle">${escapeHTML(details)}</span>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger" onclick="deleteChannel('${ch.id}')" style="padding: 0.5rem;">Excluir</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

async function saveChannel(event) {
  event.preventDefault();
  
  const type = document.getElementById('channel-type').value;
  const name = document.getElementById('channel-name').value;
  
  let payload = { type, name };
  
  if (type === 'whatsapp_group') {
    payload.chatId = document.getElementById('channel-wa-id').value;
  } else if (type === 'telegram') {
    payload.botToken = document.getElementById('channel-tg-token').value;
    payload.chatId = document.getElementById('channel-tg-chatid').value;
  } else if (type === 'discord') {
    payload.webhookUrl = document.getElementById('channel-dc-webhook').value;
  } else if (type === 'webhook') {
    payload.url = document.getElementById('channel-webhook-url').value;
    payload.method = document.getElementById('channel-webhook-method').value;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      closeModal('modal-channel');
      document.getElementById('form-channel').reset();
      loadChannels();
    } else {
      const err = await res.json();
      alert('Erro ao salvar canal: ' + err.message);
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteChannel(id) {
  if (!confirm('Deseja realmente excluir este destino?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/channels/${id}`, { method: 'DELETE' });
    if (res.ok) loadChannels();
  } catch (err) {
    console.error(err);
  }
}

// 4. Messages CRUD
async function loadMessages() {
  try {
    const res = await fetch(`${API_URL}/api/messages`);
    messages = await res.json();
    
    const list = document.getElementById('messages-list');
    if (messages.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
          <h3>Nenhuma mensagem cadastrada</h3>
          <p>Escreva os textos que serão disparados de forma agendada.</p>
        </div>`;
      return;
    }
    
    list.innerHTML = '';
    messages.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'list-item';
      
      const snippet = msg.body.length > 80 ? msg.body.substring(0, 80) + '...' : msg.body;
      
      item.innerHTML = `
        <div class="list-item-content" style="max-width: 80%;">
          <span class="list-item-title">${escapeHTML(msg.title)}</span>
          <span class="list-item-subtitle" style="white-space: pre-wrap; font-family: inherit;">${escapeHTML(snippet)}</span>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger" onclick="deleteMessage('${msg.id}')" style="padding: 0.5rem;">Excluir</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

async function saveMessage(event) {
  event.preventDefault();
  
  const title = document.getElementById('message-title').value;
  const body = document.getElementById('message-body').value;
  
  try {
    const res = await fetch(`${API_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    });
    
    if (res.ok) {
      closeModal('modal-message');
      document.getElementById('form-message').reset();
      loadMessages();
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteMessage(id) {
  if (!confirm('Deseja realmente excluir esta mensagem?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/messages/${id}`, { method: 'DELETE' });
    if (res.ok) loadMessages();
  } catch (err) {
    console.error(err);
  }
}

// 5. Schedulers CRUD
async function loadSchedulerData() {
  await Promise.all([loadChannelsDataOnly(), loadMessagesDataOnly()]);
  renderSchedulers();
}

async function loadChannelsDataOnly() {
  try {
    const res = await fetch(`${API_URL}/api/channels`);
    channels = await res.json();
  } catch (err) { console.error(err); }
}

async function loadMessagesDataOnly() {
  try {
    const res = await fetch(`${API_URL}/api/messages`);
    messages = await res.json();
  } catch (err) { console.error(err); }
}

function populateSchedulerDropdowns() {
  const msgSelect = document.getElementById('sched-message');
  msgSelect.innerHTML = '<option value="">Selecione uma mensagem...</option>';
  messages.forEach(msg => {
    const opt = document.createElement('option');
    opt.value = msg.id;
    opt.innerText = msg.title;
    msgSelect.appendChild(opt);
  });
  
  const checkGrid = document.getElementById('sched-channels-checkboxes');
  checkGrid.innerHTML = '';
  if (channels.length === 0) {
    checkGrid.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem;">Cadastre um canal primeiro.</span>';
    return;
  }
  
  channels.forEach(ch => {
    const label = document.createElement('label');
    label.className = 'channel-option';
    
    const typeLabel = {
      whatsapp_group: '[WhatsApp]',
      telegram: '[Telegram]',
      discord: '[Discord]',
      webhook: '[Webhook]'
    }[ch.type] || '';

    label.innerHTML = `
      <input type="checkbox" name="sched-channel-option" value="${ch.id}">
      <span>${escapeHTML(typeLabel)} <strong>${escapeHTML(ch.name)}</strong></span>
    `;
    checkGrid.appendChild(label);
  });
  
  resetWeekdays();
}

async function renderSchedulers() {
  try {
    const res = await fetch(`${API_URL}/api/schedulers`);
    schedulers = await res.json();
    
    const list = document.getElementById('schedulers-list');
    if (schedulers.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
          </svg>
          <h3>Nenhum agendamento ativo</h3>
          <p>Vincule mensagens a canais com dias e horários programados.</p>
        </div>`;
      return;
    }
    
    list.innerHTML = '';
    schedulers.forEach(sc => {
      const msgObj = messages.find(m => m.id === sc.messageId);
      const msgTitle = msgObj ? msgObj.title : 'Mensagem Deletada';
      
      const targetChNames = sc.channelIds.map(cId => {
        const ch = channels.find(chan => chan.id === cId);
        return ch ? ch.name : 'Destino Desconhecido';
      }).join(', ');

      const daysOfWeekMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const daysText = sc.weekdays.length === 7 ? 'Todos os dias' : sc.weekdays.map(d => daysOfWeekMap[d]).join(', ');
      
      const statusBadge = sc.active 
        ? '<span class="badge badge-wa">Ativo</span>' 
        : '<span class="badge badge-webhook">Pausado</span>';
        
      const item = document.createElement('div');
      item.className = 'list-item';
      
      item.innerHTML = `
        <div class="list-item-content">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="list-item-title">${escapeHTML(msgTitle)} às ${escapeHTML(sc.time)}</span>
            ${statusBadge}
          </div>
          <span class="list-item-subtitle">Destinos: ${escapeHTML(targetChNames)}</span>
          <span class="list-item-subtitle" style="font-size: 0.8rem; opacity: 0.8;">Repetição: ${daysText}</span>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-secondary" onclick="toggleSchedulerActive('${sc.id}', ${sc.active})" style="padding: 0.5rem;">
            ${sc.active ? 'Pausar' : 'Ativar'}
          </button>
          <button class="btn btn-danger" onclick="deleteScheduler('${sc.id}')" style="padding: 0.5rem;">Excluir</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

async function saveScheduler(event) {
  event.preventDefault();
  
  const messageId = document.getElementById('sched-message').value;
  const time = document.getElementById('sched-time').value;
  const active = document.getElementById('sched-active').value === 'true';
  const weekdays = selectedWeekdays;
  
  const channelIds = [];
  document.querySelectorAll('input[name="sched-channel-option"]:checked').forEach(cb => {
    channelIds.push(cb.value);
  });
  
  if (channelIds.length === 0) {
    alert('Por favor, selecione pelo menos um canal de destino.');
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/schedulers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, channelIds, time, weekdays, active })
    });
    
    if (res.ok) {
      closeModal('modal-scheduler');
      document.getElementById('form-scheduler').reset();
      resetWeekdays();
      loadSchedulerData();
    }
  } catch (err) {
    console.error(err);
  }
}

async function toggleSchedulerActive(id, currentStatus) {
  try {
    const res = await fetch(`${API_URL}/api/schedulers/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !currentStatus })
    });
    if (res.ok) loadSchedulerData();
  } catch (err) {
    console.error(err);
  }
}

async function deleteScheduler(id) {
  if (!confirm('Deseja realmente excluir este agendamento?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/schedulers/${id}`, { method: 'DELETE' });
    if (res.ok) loadSchedulerData();
  } catch (err) {
    console.error(err);
  }
}

// 6. Logs Section
async function loadLogs() {
  try {
    const res = await fetch(`${API_URL}/api/logs`);
    const logs = await res.json();
    
    const tbody = document.getElementById('logs-table-body');
    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 3rem;">
            Nenhum log de disparo registrado.
          </td>
        </tr>`;
      return;
    }
    
    tbody.innerHTML = '';
    logs.forEach(log => {
      const statusIconClass = log.status === 'success' ? 'success' : 'failure';
      const statusLabel = log.status === 'success' ? 'Sucesso' : 'Falha';
      
      const tr = document.createElement('tr');
      const dateText = new Date(log.timestamp).toLocaleString('pt-BR');
      
      tr.innerHTML = `
        <td style="font-weight: 600;">${dateText}</td>
        <td><strong style="color:#fff;">${escapeHTML(log.channelName || 'Destino Desconhecido')}</strong></td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHTML(log.messageText)}
        </td>
        <td>
          <div class="status-indicator ${statusIconClass}">
            <div class="circle"></div>
            <span>${statusLabel}</span>
          </div>
        </td>
        <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHTML(log.errorDetails || 'Sem erros.')}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

async function clearAllLogs() {
  if (!confirm('Deseja realmente limpar todo o histórico de logs de disparo?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/logs`, { method: 'DELETE' });
    if (res.ok) loadLogs();
  } catch (err) {
    console.error(err);
  }
}

// 7. Live Console Logger in Dashboard
let consolePollInterval = null;
let lastLogTimestamp = 0;

function startConsolePolling() {
  const container = document.getElementById('console-logs-container');
  if (consolePollInterval) clearInterval(consolePollInterval);
  
  consolePollInterval = setInterval(async () => {
    if (currentView !== 'dashboard') return;
    
    try {
      const res = await fetch(`${API_URL}/api/system-logs?since=${lastLogTimestamp}`);
      const logs = await res.json();
      
      if (logs.length > 0) {
        logs.forEach(l => {
          const line = document.createElement('div');
          line.className = `console-line ${l.type}`;
          const time = new Date(l.timestamp).toLocaleTimeString('pt-BR');
          line.innerHTML = `<span class="console-time">${time}</span> ${escapeHTML(l.message)}`;
          container.appendChild(line);
          lastLogTimestamp = Math.max(lastLogTimestamp, l.timestamp);
        });
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      console.error('Erro ao ler logs de console:', err);
    }
  }, 3000);
}

function clearConsole() {
  document.getElementById('console-logs-container').innerHTML = `
    <div class="console-line info"><span class="console-time">--:--:--</span> Histórico limpo. Aguardando novos eventos...</div>`;
}

// Utilities
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  switchView('dashboard');
  
  // Start polling system log events
  startConsolePolling();
  
  // Pull dashboard stats
  loadDashboardStats();
  
  // Poll statistics periodically
  setInterval(() => {
    if (currentView === 'dashboard') {
      loadDashboardStats();
    }
  }, 10000);
});
