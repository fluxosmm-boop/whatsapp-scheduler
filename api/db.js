const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'message_scheduler';

// For local fallback (JSON Database)
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure local directory exists
if (!MONGODB_URI && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Memory logs cache for live dashboard console
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

// MongoDB Client Promise
let mongoClient = null;
async function getMongoDb() {
  if (!MONGODB_URI) return null;
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    logSystem('Conectado ao MongoDB Atlas com sucesso.', 'success');
  }
  return mongoClient.db(DB_NAME);
}

// Read database (Universal)
async function readDatabase() {
  const db = await getMongoDb();
  if (db) {
    try {
      const channels = await db.collection('channels').find({}).toArray();
      const messages = await db.collection('messages').find({}).toArray();
      const schedulers = await db.collection('schedulers').find({}).toArray();
      const logs = await db.collection('logs').find({}).toArray();
      const settings = await db.collection('settings').findOne({ id: 'global' }) || { id: 'global', waApiUrl: '', waApiToken: '' };

      // Convert _id to id string for frontend compatibility
      const mapId = (arr) => arr.map(item => {
        const newItem = { ...item, id: item._id.toString() };
        delete newItem._id;
        return newItem;
      });

      return {
        channels: mapId(channels),
        messages: mapId(messages),
        schedulers: mapId(schedulers),
        logs: mapId(logs),
        settings
      };
    } catch (err) {
      logSystem(`Erro ao carregar dados do MongoDB: ${err.message}`, 'error');
    }
  }

  // Fallback: Local JSON database
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialData = {
        channels: [],
        messages: [],
        schedulers: [],
        logs: [],
        settings: { id: 'global', waApiUrl: '', waApiToken: '' }
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      return initialData;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.settings) {
      parsed.settings = { id: 'global', waApiUrl: '', waApiToken: '' };
    }
    return parsed;
  } catch (err) {
    logSystem(`Erro ao carregar banco de dados local: ${err.message}`, 'error');
    return { channels: [], messages: [], schedulers: [], logs: [], settings: { id: 'global', waApiUrl: '', waApiToken: '' } };
  }
}

// Generic write functions to update single collections
async function saveCollectionItem(collectionName, item) {
  const db = await getMongoDb();
  if (db) {
    const mongoItem = { ...item };
    if (mongoItem.id) {
      const idStr = mongoItem.id;
      delete mongoItem.id;
      
      // If it looks like ObjectId, use it, otherwise keep it as string or match filter
      let filter = {};
      if (ObjectId.isValid(idStr)) {
        filter = { _id: new ObjectId(idStr) };
      } else {
        filter = { _id: idStr }; // handle custom string ids
      }
      
      await db.collection(collectionName).updateOne(filter, { $set: mongoItem }, { upsert: true });
    } else {
      const res = await db.collection(collectionName).insertOne(mongoItem);
      item.id = res.insertedId.toString();
    }
    return item;
  }

  // Local write
  const data = await readDatabase();
  if (!item.id) {
    item.id = collectionName.substring(0, 3) + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  const idx = data[collectionName].findIndex(x => x.id === item.id);
  if (idx !== -1) {
    data[collectionName][idx] = item;
  } else {
    data[collectionName].push(item);
  }
  
  writeLocalDB(data);
  return item;
}

async function deleteCollectionItem(collectionName, itemId) {
  const db = await getMongoDb();
  if (db) {
    let filter = {};
    if (ObjectId.isValid(itemId)) {
      filter = { _id: new ObjectId(itemId) };
    } else {
      filter = { _id: itemId };
    }
    await db.collection(collectionName).deleteOne(filter);
    return true;
  }

  // Local delete
  const data = await readDatabase();
  data[collectionName] = data[collectionName].filter(x => x.id !== itemId);
  
  // Clean references in schedulers if a channel was deleted
  if (collectionName === 'channels') {
    data.schedulers.forEach(s => {
      s.channelIds = s.channelIds.filter(cId => cId !== itemId);
    });
    data.schedulers = data.schedulers.filter(s => s.channelIds.length > 0);
  }
  // Clean schedulers if message deleted
  if (collectionName === 'messages') {
    data.schedulers = data.schedulers.filter(s => s.messageId !== itemId);
  }
  
  writeLocalDB(data);
  return true;
}

async function saveSettings(settings) {
  const db = await getMongoDb();
  if (db) {
    await db.collection('settings').updateOne({ id: 'global' }, { $set: settings }, { upsert: true });
    return settings;
  }

  const data = await readDatabase();
  data.settings = settings;
  writeLocalDB(data);
  return settings;
}

function writeLocalDB(data) {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Erro ao gravar DB local:', err);
  }
}

// Clean all logs
async function clearAllLogs() {
  const db = await getMongoDb();
  if (db) {
    await db.collection('logs').deleteMany({});
    return;
  }
  const data = await readDatabase();
  data.logs = [];
  writeLocalDB(data);
}

module.exports = {
  readDatabase,
  saveCollectionItem,
  deleteCollectionItem,
  saveSettings,
  clearAllLogs,
  logSystem,
  systemLogs
};
