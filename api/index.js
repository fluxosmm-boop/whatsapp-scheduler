const express = require('express');
const cors = require('cors');
const path = require('path');
const dbHelper = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (only needed for local running)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Stats API
app.get('/api/stats', async (req, res) => {
  try {
    const db = await dbHelper.readDatabase();
    const activeScheds = db.schedulers.filter(s => s.active).length;
    const sentCount = db.logs.length;
    
    const successCount = db.logs.filter(l => l.status === 'success').length;
    const successRate = sentCount > 0 ? Math.round((successCount / sentCount) * 100) : 100;
    
    // Status WA is online if API Url and token are configured
    const waStatus = (db.settings.waApiUrl && db.settings.waApiToken) ? 'connected' : 'disconnected';

    res.json({
      activeScheds,
      sentCount,
      successRate,
      waStatus
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Settings API
app.get('/api/settings', async (req, res) => {
  try {
    const db = await dbHelper.readDatabase();
    res.json(db.settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const newSettings = {
      id: 'global',
      waApiUrl: req.body.waApiUrl || '',
      waApiToken: req.body.waApiToken || ''
    };
    await dbHelper.saveSettings(newSettings);
    dbHelper.logSystem('Configurações da API de WhatsApp atualizadas.', 'success');
    res.json(newSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Channels API
app.get('/api/channels', async (req, res) => {
  try {
    const db = await dbHelper.readDatabase();
    res.json(db.channels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/channels', async (req, res) => {
  try {
    const ch = await dbHelper.saveCollectionItem('channels', req.body);
    dbHelper.logSystem(`Destino adicionado: ${ch.name} (${ch.type})`, 'info');
    res.status(201).json(ch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/channels/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await dbHelper.deleteCollectionItem('channels', id);
    dbHelper.logSystem(`Destino removido.`, 'info');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Messages API
app.get('/api/messages', async (req, res) => {
  try {
    const db = await dbHelper.readDatabase();
    res.json(db.messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const msg = await dbHelper.saveCollectionItem('messages', req.body);
    dbHelper.logSystem(`Mensagem cadastrada: ${msg.title}`, 'info');
    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/messages/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await dbHelper.deleteCollectionItem('messages', id);
    dbHelper.logSystem(`Mensagem removida.`, 'info');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Schedulers API
app.get('/api/schedulers', async (req, res) => {
  try {
    const db = await dbHelper.readDatabase();
    res.json(db.schedulers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/schedulers', async (req, res) => {
  try {
    const sc = await dbHelper.saveCollectionItem('schedulers', req.body);
    dbHelper.logSystem(`Agendamento criado às ${sc.time}`, 'info');
    res.status(201).json(sc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/schedulers/:id/toggle', async (req, res) => {
  try {
    const db = await dbHelper.readDatabase();
    const sched = db.schedulers.find(s => s.id === req.params.id);
    if (sched) {
      sched.active = req.body.active;
      await dbHelper.saveCollectionItem('schedulers', sched);
      dbHelper.logSystem(`Agendamento ${sched.id} ${sched.active ? 'ativado' : 'pausado'}`, 'info');
      return res.json(sched);
    }
    res.status(404).json({ message: 'Agendamento não encontrado.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/schedulers/:id', async (req, res) => {
  try {
    await dbHelper.deleteCollectionItem('schedulers', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Logs API
app.get('/api/logs', async (req, res) => {
  try {
    const db = await dbHelper.readDatabase();
    res.json([...db.logs].reverse());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    await dbHelper.clearAllLogs();
    dbHelper.logSystem('Histórico de logs de disparo limpo.', 'info');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Live Console System Logs API
app.get('/api/system-logs', (req, res) => {
  const since = parseInt(req.query.since || 0);
  const filtered = dbHelper.systemLogs.filter(l => l.timestamp > since);
  res.json(filtered);
});

// Standalone Server running check (for local development)
if (require.main === module) {
  // Start local node-cron scheduler in development mode
  const cron = require('node-cron');
  const cronHandler = require('./cron');

  cron.schedule('* * * * *', async () => {
    dbHelper.logSystem('Verificação do cron local executada...', 'info');
    
    // Create mock req and res to run cron.js code directly
    const mockReq = { headers: {} };
    const mockRes = {
      status: (code) => ({
        json: (data) => console.log(`[LOCAL CRON] HTTP ${code}:`, JSON.stringify(data))
      })
    };
    await cronHandler(mockReq, mockRes);
  });

  app.listen(PORT, () => {
    dbHelper.logSystem(`Servidor local do agendador rodando na porta ${PORT}!`, 'success');
    dbHelper.logSystem(`Desenvolvimento local: http://localhost:${PORT}`, 'info');
    
    // Open in browser natively based on platform
    const { exec } = require('child_process');
    const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${startCmd} http://localhost:${PORT}`, (err) => {
      if (err) console.log('Nota: Abra o navegador manualmente em http://localhost:' + PORT);
    });
  });
}

// Export Express app for Vercel Serverless Functions
module.exports = app;
