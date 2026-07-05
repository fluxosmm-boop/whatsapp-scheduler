const dbHelper = require('./db');

// Main Cron Trigger Endpoint (Serverless Function)
module.exports = async function handler(req, res) {
  // Security check: If CRON_SECRET is defined in environment variables, validate it
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    const incomingToken = authHeader ? authHeader.replace('Bearer ', '') : req.query.secret;
    
    if (incomingToken !== cronSecret) {
      dbHelper.logSystem('Acesso negado ao Cron: Token inválido.', 'warning');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const now = new Date();
  
  // Format current local time to HH:MM in America/Sao_Paulo (or user default time)
  // Let's get time formatted in local timezone (GMT-3 is common in Brazil, let's use timezone formatting or UTC fallback)
  // We can format it based on UTC offset or standard Brazil timezone
  const localTimeOptions = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false };
  const currentTime = now.toLocaleTimeString('pt-BR', localTimeOptions);
  const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...

  dbHelper.logSystem(`Cron acionado às ${currentTime}. Procurando agendamentos...`, 'info');

  try {
    const db = await dbHelper.readDatabase();
    
    // Find active schedules that match the current time (HH:MM) and weekday
    const matches = db.schedulers.filter(s => {
      return s.active && s.time === currentTime && s.weekdays.includes(currentDayOfWeek);
    });

    if (matches.length === 0) {
      dbHelper.logSystem('Nenhum agendamento ativo corresponde ao horário e dia atual.', 'info');
      return res.status(200).json({ status: 'no_matches', time: currentTime });
    }

    dbHelper.logSystem(`Identificados ${matches.length} agendamentos. Iniciando envios...`, 'info');

    for (const sched of matches) {
      const message = db.messages.find(m => m.id === sched.messageId);
      if (!message) {
        dbHelper.logSystem(`Agendamento ${sched.id} ignorado: Mensagem ${sched.messageId} não encontrada.`, 'warning');
        continue;
      }

      for (const channelId of sched.channelIds) {
        const channel = db.channels.find(c => c.id === channelId);
        if (!channel) {
          dbHelper.logSystem(`Falha no disparo: Canal ${channelId} não cadastrado.`, 'warning');
          continue;
        }

        dbHelper.logSystem(`Disparando mensagem "${message.title}" para "${channel.name}"...`, 'info');
        const result = await dispatchMessage(channel, message.body, db.settings);

        // Record log entry
        const logEntry = {
          timestamp: Date.now(),
          schedulerId: sched.id,
          channelName: channel.name,
          channelType: channel.type,
          messageText: message.body.length > 50 ? message.body.substring(0, 50) + '...' : message.body,
          status: result.success ? 'success' : 'failure',
          errorDetails: result.success ? null : result.error
        };

        await dbHelper.saveCollectionItem('logs', logEntry);

        if (result.success) {
          dbHelper.logSystem(`Envio com sucesso para "${channel.name}".`, 'success');
        } else {
          dbHelper.logSystem(`Falha ao enviar para "${channel.name}": ${result.error}`, 'error');
        }
      }
    }

    return res.status(200).json({ status: 'completed', dispatched: matches.length });
  } catch (err) {
    dbHelper.logSystem(`Erro geral no motor de cron: ${err.message}`, 'error');
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// Dispatch logic supporting External WhatsApp API Gateway, Telegram, Discord and Custom Webhooks
async function dispatchMessage(channel, messageText, settings) {
  try {
    if (channel.type === 'whatsapp_group') {
      if (!settings.waApiUrl || !settings.waApiToken) {
        throw new Error('Configurações da API Externa do WhatsApp (URL/Token) estão incompletas.');
      }
      if (!channel.chatId) {
        throw new Error('ID do Grupo do WhatsApp ausente no cadastro do canal.');
      }

      // Universal payload format compatible with Evolution API, Z-API, and custom webhook solutions
      const payload = {
        chatId: channel.chatId,
        to: channel.chatId,
        number: channel.chatId,
        message: messageText,
        text: messageText
      };

      // Set headers for all common API authentications
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.waApiToken}`,
        'apikey': settings.waApiToken,
        'x-api-key': settings.waApiToken,
        'token': settings.waApiToken
      };

      const res = await fetch(settings.waApiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Erro na API do WhatsApp: HTTP ${res.status} - ${text.substring(0, 100)}`);
      }
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
    
    throw new Error('Tipo de canal desconhecido.');
  } catch (err) {
    return { success: false, error: err.message };
  }
}
