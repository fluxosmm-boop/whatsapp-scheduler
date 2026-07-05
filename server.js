const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Directories Setup
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Memory System Logs (for the dashboard console)
let systemLogs = [];
function logSystem(message, type = 'info') {
  const timestamp = Date.now();
  const logEntry = { timestamp, message, type };
  systemLogs.push(logEntry);
  if (systemLogs.length > 50) {
    systemLogs.shift();
  }
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Database Operations
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialData = { channels: [], messages: [], schedulers: [], logs: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      return initialData;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Erro ao ler banco de dados JSON:', err);
    return { channels: [], messages: [], schedulers: [], logs: [] };
  }
}

function writeDB(data) {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Erro ao salvar banco de dados JSON:', err);
  }
}

// WhatsApp State Variables
let client = null;
let waStatus = 'disconnected'; 
let latestQR = null;

// Initialize WhatsApp client
function initWhatsApp(auto = false) {
  if (client) {
    logSystem('Cliente WhatsApp já inicializado.', 'warning');
    return;
  }

  logSystem('Inicializando WhatsApp Web (Puppeteer)...', 'info');
  waStatus = 'connecting';

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, 'data', '.wwebjs_auth')
    }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    },
    puppeteer: {
      headless: true,
      protocolTimeout: 180000, // 3 minutes timeout
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-default-apps',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      ]
    }
  });

  client.on('qr', (qr) => {
    latestQR = qr;
    waStatus = 'qr_ready';
    logSystem('QR Code gerado. Pronto para escanear no Dashboard.', 'info');
  });

  client.on('ready', () => {
    waStatus = 'connected';
    latestQR = null;
    logSystem('Conexão com o WhatsApp estabelecida com sucesso!', 'success');
  });

  client.on('authenticated', () => {
    logSystem('Autenticado no WhatsApp.', 'info');
  });

  client.on('auth_failure', (msg) => {
    waStatus = 'disconnected';
    client = null;
    latestQR = null;
    logSystem(`Falha na autenticação do WhatsApp: ${msg}`, 'error');
  });

  client.on('disconnected', (reason) => {
    waStatus = 'disconnected';
    client = null;
    latestQR = null;
    logSystem(`Sessão do WhatsApp desconectada: ${reason}`, 'warning');
  });

  client.initialize().catch(err => {
    waStatus = 'disconnected';
    client = null;
    latestQR = null;
    logSystem(`Erro ao inicializar WhatsApp: ${err.message}`, 'error');
  });
}

// Auto init WhatsApp if there's a saved session
const authDir = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(authDir)) {
  logSystem('Sessão do WhatsApp salva detectada. Iniciando conexão automática...', 'info');
  initWhatsApp(true);
} else {
  logSystem('Nenhuma sessão salva do WhatsApp encontrada. Conecte pelo Dashboard.', 'info');
}

// REST API Endpoints

// 1. WhatsApp status
app.get('/api/whatsapp/status', async (req, res) => {
  if (waStatus === 'qr_ready' && latestQR) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(latestQR);
      return res.json({ status: waStatus, qrCodeDataUrl });
    } catch (err) {
      return res.json({ status: waStatus, error: 'Erro ao gerar QR Code' });
    }
  }
  res.json({ status: waStatus });
});

app.post('/api/whatsapp/connect', (req, res) => {
  if (waStatus === 'disconnected') {
    initWhatsApp();
    return res.json({ success: true, message: 'Inicializando conexão.' });
  }
  res.json({ success: false, message: `Status atual: ${waStatus}` });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  if (client) {
    try {
      await client.logout();
      logSystem('Sessão do WhatsApp encerrada pelo usuário.', 'info');
    } catch (e) {
      logSystem('Forçando encerramento do cliente WhatsApp...', 'warning');
    }
    client = null;
    waStatus = 'disconnected';
    latestQR = null;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'WhatsApp não inicializado.' });
  }
});

// Sincronizar grupos do WhatsApp e salvar nos canais
app.post('/api/whatsapp/sync-groups', async (req, res) => {
  if (waStatus !== 'connected' || !client) {
    return res.status(400).json({ message: 'WhatsApp não está conectado!' });
  }

  try {
    logSystem('Buscando conversas do WhatsApp...', 'info');
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    const db = readDB();
    let count = 0;

    groups.forEach(group => {
      const exists = db.channels.find(c => c.chatId === group.id._serialized);
      if (!exists) {
        db.channels.push({
          id: 'ch_' + Math.random().toString(36).substr(2, 9),
          type: 'whatsapp_group',
          name: group.name || 'Grupo Sem Nome',
          chatId: group.id._serialized
        });
        count++;
      }
    });

    if (count > 0) {
      writeDB(db);
    }

    logSystem(`${count} novos grupos do WhatsApp sincronizados com sucesso.`, 'success');
    res.json({ success: true, count });
  } catch (err) {
    logSystem(`Erro ao sincronizar grupos: ${err.message}`, 'error');
    res.status(500).json({ message: err.message });
  }
});

// 2. Stats
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const activeScheds = db.schedulers.filter(s => s.active).length;
  const sentCount = db.logs.length;
  
  const successCount = db.logs.filter(l => l.status === 'success').length;
  const successRate = sentCount > 0 ? Math.round((successCount / sentCount) * 100) : 100;

  res.json({
    activeScheds,
    sentCount,
    successRate,
    waStatus
  });
});

// 3. Channels CRUD
app.get('/api/channels', (req, res) => {
  const db = readDB();
  res.json(db.channels);
});

app.post('/api/channels', (req, res) => {
  const db = readDB();
  const newChannel = {
    id: 'ch_' + Math.random().toString(36).substr(2, 9),
    ...req.body
  };
  db.channels.push(newChannel);
  writeDB(db);
  logSystem(`Destino adicionado: ${newChannel.name} (${newChannel.type})`, 'info');
  res.status(201).json(newChannel);
});

app.delete('/api/channels/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  
  const ch = db.channels.find(c => c.id === id);
  if (ch) {
    db.channels = db.channels.filter(c => c.id !== id);
    db.schedulers.forEach(s => {
      s.channelIds = s.channelIds.filter(cId => cId !== id);
    });
    db.schedulers = db.schedulers.filter(s => s.channelIds.length > 0);
    writeDB(db);
    logSystem(`Destino removido: ${ch.name}`, 'info');
    return res.json({ success: true });
  }
  res.status(404).json({ message: 'Canal não encontrado.' });
});

// 4. Messages CRUD
app.get('/api/messages', (req, res) => {
  const db = readDB();
  res.json(db.messages);
});

app.post('/api/messages', (req, res) => {
  const db = readDB();
  const newMsg = {
    id: 'msg_' + Math.random().toString(36).substr(2, 9),
    ...req.body
  };
  db.messages.push(newMsg);
  writeDB(db);
  logSystem(`Mensagem cadastrada: ${newMsg.title}`, 'info');
  res.status(201).json(newMsg);
});

app.delete('/api/messages/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  
  const msg = db.messages.find(m => m.id === id);
  if (msg) {
    db.messages = db.messages.filter(m => m.id !== id);
    db.schedulers = db.schedulers.filter(s => s.messageId !== id);
    writeDB(db);
    logSystem(`Mensagem removida: ${msg.title}`, 'info');
    return res.json({ success: true });
  }
  res.status(404).json({ message: 'Mensagem não encontrada.' });
});

// 5. Schedulers CRUD
app.get('/api/schedulers', (req, res) => {
  const db = readDB();
  res.json(db.schedulers);
});

app.post('/api/schedulers', (req, res) => {
  const db = readDB();
  const newSched = {
    id: 'sc_' + Math.random().toString(36).substr(2, 9),
    ...req.body
  };
  db.schedulers.push(newSched);
  writeDB(db);
  logSystem(`Agendamento criado às ${newSched.time}`, 'info');
  res.status(201).json(newSched);
});

app.post('/api/schedulers/:id/toggle', (req, res) => {
  const db = readDB();
  const sched = db.schedulers.find(s => s.id === req.params.id);
  if (sched) {
    sched.active = req.body.active;
    writeDB(db);
    logSystem(`Agendamento ${sched.id} ${sched.active ? 'ativado' : 'pausado'}`, 'info');
    return res.json(sched);
  }
  res.status(404).json({ message: 'Agendamento não encontrado.' });
});

app.delete('/api/schedulers/:id', (req, res) => {
  const db = readDB();
  db.schedulers = db.schedulers.filter(s => s.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// 6. Logs & Live Console API
app.get('/api/logs', (req, res) => {
  const db = readDB();
  res.json([...db.logs].reverse());
});

app.delete('/api/logs', (req, res) => {
  const db = readDB();
  db.logs = [];
  writeDB(db);
  logSystem('Histórico de logs de disparo limpo.', 'info');
  res.json({ success: true });
});

app.get('/api/system-logs', (req, res) => {
  const since = parseInt(req.query.since || 0);
  const filtered = systemLogs.filter(l => l.timestamp > since);
  res.json(filtered);
});

// Message Dispatch Function
async function dispatchMessage(channel, messageText) {
  try {
    if (channel.type === 'whatsapp_group') {
      if (waStatus !== 'connected' || !client) {
        throw new Error('WhatsApp não está conectado.');
      }
      if (!channel.chatId) {
        throw new Error('Grupo do WhatsApp sem ID de Chat cadastrado.');
      }
      await client.sendMessage(channel.chatId, messageText);
      return { success: true };
    } 
    
    else if (channel.type === 'telegram') {
      if (!channel.botToken || !channel.chatId) {
        throw new Error('Token ou Chat ID do Telegram ausentes.');
      }
      const url = `https://api.telegram.org/bot${channel.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channel.chatId,
          text: messageText
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.description || 'Erro na API do Telegram');
      }
      return { success: true };
    } 
    
    else if (channel.type === 'discord') {
      if (!channel.webhookUrl) {
        throw new Error('Webhook URL do Discord ausente.');
      }
      const res = await fetch(channel.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageText
        })
      });
      if (!res.ok) {
        throw new Error(`Erro na API do Discord: HTTP ${res.status}`);
      }
      return { success: true };
    } 
    
    else if (channel.type === 'webhook') {
      if (!channel.url) {
        throw new Error('URL do Webhook ausente.');
      }
      
      let fetchOptions = { method: channel.method || 'POST' };
      let fetchUrl = channel.url;
      
      if (fetchOptions.method === 'GET') {
        const separator = fetchUrl.includes('?') ? '&' : '?';
        fetchUrl = `${fetchUrl}${separator}message=${encodeURIComponent(messageText)}`;
      } else {
        fetchOptions.headers = { 'Content-Type': 'application/json' };
        fetchOptions.body = JSON.stringify({ message: messageText });
      }
      
      const res = await fetch(fetchUrl, fetchOptions);
      if (!res.ok) {
        throw new Error(`Erro no Webhook customizado: HTTP ${res.status}`);
      }
      return { success: true };
    }
    
    throw new Error('Tipo de destino de canal desconhecido.');
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// cron scheduler check (every minute)
cron.schedule('* * * * *', async () => {
  const now = new Date();
  
  // Format current local time: HH:MM in Brazil
  const localTimeOptions = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false };
  const currentTime = now.toLocaleTimeString('pt-BR', localTimeOptions);
  const currentDayOfWeek = now.getDay(); 
  
  const db = readDB();
  
  const matches = db.schedulers.filter(s => {
    return s.active && s.time === currentTime && s.weekdays.includes(currentDayOfWeek);
  });
  
  if (matches.length === 0) return;
  
  logSystem(`Identificados ${matches.length} agendamentos para às ${currentTime}. Iniciando disparos...`, 'info');
  
  for (const sched of matches) {
    const message = db.messages.find(m => m.id === sched.messageId);
    if (!message) {
      logSystem(`Agendamento ${sched.id} ignorado: Mensagem ${sched.messageId} não encontrada.`, 'warning');
      continue;
    }
    
    for (const channelId of sched.channelIds) {
      const channel = db.channels.find(c => c.id === channelId);
      if (!channel) {
        logSystem(`Falha no envio do agendamento ${sched.id}: Canal ${channelId} não encontrado.`, 'warning');
        continue;
      }
      
      logSystem(`Enviando mensagem "${message.title}" para o destino "${channel.name}"...`, 'info');
      const result = await dispatchMessage(channel, message.body);
      
      const logEntry = {
        timestamp: Date.now(),
        schedulerId: sched.id,
        channelName: channel.name,
        channelType: channel.type,
        messageText: message.body.length > 50 ? message.body.substring(0, 50) + '...' : message.body,
        status: result.success ? 'success' : 'failure',
        errorDetails: result.success ? null : result.error
      };
      
      db.logs.push(logEntry);
      
      if (result.success) {
        logSystem(`Mensagem enviada com sucesso para "${channel.name}".`, 'success');
      } else {
        logSystem(`Falha ao enviar para "${channel.name}": ${result.error}`, 'error');
      }
    }
  }
  
  writeDB(db); 
});

// Start Express Server
app.listen(PORT, () => {
  logSystem(`Painel de Controle rodando na porta ${PORT}!`, 'success');
  logSystem(`Acesse o painel em http://localhost:${PORT}`, 'info');
});
