const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const Telemetry = require('./models/Telemetry');

const app = express();
const PORT = process.env.PORT || 5000;
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8000';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/behavioral_analytics';

// In-Memory fallback store if MongoDB is offline
let inMemoryTelemetryDB = [];
let isMongoConnected = false;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Dynamic MongoDB Connection Event Listeners
mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  console.log('✅ Connected to MongoDB database successfully.');
});

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.warn('⚠️  MongoDB disconnected. Switching to In-Memory Mode.');
});

mongoose.connection.on('error', (err) => {
  isMongoConnected = false;
  console.error('❌ MongoDB connection error:', err.message);
});

// Initial Database Connection Attempt
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 3000
}).catch((err) => {
  isMongoConnected = false;
  console.warn('⚠️  Initial MongoDB connection unavailable. Operating in high-performance In-Memory Mode.');
});

// Helper to save telemetry safely to MongoDB or In-Memory
async function saveTelemetryRecord(recordData) {
  const timestamp = recordData.timestamp || new Date().toISOString();
  const normalizedData = {
    ...recordData,
    timestamp
  };

  if (isMongoConnected) {
    try {
      const telemetryDoc = new Telemetry(normalizedData);
      return await telemetryDoc.save();
    } catch (err) {
      console.error('Mongo save failed, falling back to memory store:', err.message);
    }
  }

  const memoryRecord = {
    _id: 'mem_' + Math.random().toString(36).substring(2, 11),
    ...normalizedData,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  inMemoryTelemetryDB.push(memoryRecord);
  if (inMemoryTelemetryDB.length > 5000) inMemoryTelemetryDB.shift();
  return memoryRecord;
}

// Helper to fetch telemetry records safely with array sorting protection
async function fetchTelemetryRecords(limit = 100, filter = {}) {
  if (isMongoConnected) {
    try {
      return await Telemetry.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
    } catch (err) {
      console.error('Mongo query failed, fetching from memory:', err.message);
    }
  }

  let records = [...inMemoryTelemetryDB];
  if (filter.userId) records = records.filter(r => r.userId === filter.userId);
  if (filter.isAnomaly !== undefined) records = records.filter(r => r.isAnomaly === filter.isAnomaly);

  return records.sort((a, b) => {
    const timeA = a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  }).slice(0, limit);
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

/**
 * @route GET /api/health
 * @desc  Enhanced health check endpoint performing active ping to Python ML Engine
 */
app.get('/api/health', async (req, res) => {
  let mlStatus = 'offline';
  try {
    const mlHealthRes = await axios.get(`${ML_ENGINE_URL}/health`, { timeout: 1500 });
    if (mlHealthRes.status === 200 && mlHealthRes.data) {
      mlStatus = 'online';
    }
  } catch (err) {
    mlStatus = 'offline';
  }

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: isMongoConnected ? 'MongoDB' : 'In-Memory (Fallback)',
    mlEngine: mlStatus,
    mlEngineUrl: ML_ENGINE_URL
  });
});

/**
 * @route POST /api/telemetry
 * @desc  Ingest telemetry data, sanitize payload, and trigger ML anomaly detection
 */
app.post('/api/telemetry', async (req, res) => {
  try {
    const userId = String(req.body.userId || 'usr_anonymous');
    const sessionId = String(req.body.sessionId || 'sess_default');
    const currentDomain = String(req.body.currentDomain || 'unknown');
    const timestamp = req.body.timestamp || new Date().toISOString();

    // Sanitization: Ensure all numerical parameters are >= 0
    const activeTabDuration = Math.max(0, Number(req.body.activeTabDuration) || 0);
    const domainSwitches = Math.max(0, Number(req.body.domainSwitches) || 0);
    const idleStateDuration = Math.max(0, Number(req.body.idleStateDuration) || 0);
    const scrollVelocity = Math.max(0, Number(req.body.scrollVelocity) || 0);
    const mouseActivityScore = Math.max(0, Number(req.body.mouseActivityScore) || 0);

    // Validate activeHour strictly between 0 and 23
    let activeHour;
    if (req.body.activeHour !== undefined && req.body.activeHour !== null && !isNaN(Number(req.body.activeHour))) {
      activeHour = Math.min(23, Math.max(0, Math.floor(Number(req.body.activeHour))));
    } else {
      activeHour = new Date().getHours();
    }

    const payload = {
      userId,
      sessionId,
      activeTabDuration,
      domainSwitches,
      idleStateDuration,
      scrollVelocity,
      mouseActivityScore,
      activeHour,
      currentDomain,
      timestamp
    };

    // Enrich payload with real-time ML Anomaly Detection & Clustering
    let mlEnrichment = {
      anomalyScore: 10.0,
      isAnomaly: false,
      archetype: 'Standard User',
      clusterId: 0
    };

    try {
      const mlResponse = await axios.post(`${ML_ENGINE_URL}/api/detect-anomaly`, payload, { timeout: 3000 });
      if (mlResponse.data) {
        mlEnrichment = {
          anomalyScore: mlResponse.data.anomaly_score ?? mlResponse.data.anomalyScore ?? 10.0,
          isAnomaly: mlResponse.data.is_anomaly ?? mlResponse.data.isAnomaly ?? false,
          archetype: mlResponse.data.archetype || 'Standard User',
          clusterId: mlResponse.data.cluster_id ?? mlResponse.data.clusterId ?? 0
        };
      }
    } catch (mlErr) {
      console.warn(`[ML Engine] Real-time scoring offline (${mlErr.message}). Applying heuristic rule fallback.`);
      
      // Rule-based heuristic fallback if ML engine is starting up
      const heuristicScore = Math.min(
        100,
        (payload.domainSwitches * 6) +
        (payload.scrollVelocity > 500 ? 35 : 0) +
        (payload.activeHour < 5 ? 25 : 0) +
        (payload.mouseActivityScore > 80 ? 20 : 0)
      );
      mlEnrichment = {
        anomalyScore: parseFloat(heuristicScore.toFixed(2)),
        isAnomaly: heuristicScore > 65,
        archetype: heuristicScore > 65 ? 'High Velocity Anomaly' : 'Standard Web User',
        clusterId: heuristicScore > 65 ? 3 : 0
      };
    }

    const savedRecord = await saveTelemetryRecord({
      ...payload,
      ...mlEnrichment
    });

    console.log(`[Ingest API] Ingested record for ${userId}. Anomaly: ${mlEnrichment.isAnomaly} (Score: ${mlEnrichment.anomalyScore})`);

    res.status(201).json({
      success: true,
      message: 'Telemetry ingested successfully',
      data: savedRecord
    });
  } catch (error) {
    console.error('[Ingest API Error]:', error);
    res.status(500).json({ success: false, error: 'Internal server error while ingesting telemetry' });
  }
});

/**
 * @route GET /api/telemetry
 * @desc  Fetch ingested telemetry records for dashboard visualization
 */
app.get('/api/telemetry', async (req, res) => {
  try {
    const limit = Math.max(1, parseInt(req.query.limit) || 200);
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const isAnomalyOnly = req.query.anomalies === 'true';

    const filter = {};
    if (userId) filter.userId = userId;
    if (isAnomalyOnly) filter.isAnomaly = true;

    const records = await fetchTelemetryRecords(limit, filter);
    res.json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/profile
 * @desc  Fetch comprehensive behavioral profiling, PCA components & clusters from ML engine
 */
app.get('/api/profile', async (req, res) => {
  try {
    // Fetch last 500 records to feed into Python ML Pipeline for PCA & K-Means
    const rawRecords = await fetchTelemetryRecords(500);

    if (rawRecords.length < 4) {
      // Return sample baseline if insufficient telemetry data exists yet
      return res.json({
        success: true,
        isBaseline: true,
        message: 'Insufficient live data for complete PCA. Seed data available.',
        archetypes: [
          { name: 'Focused Researcher', count: 12, description: 'Long tab duration, low domain switching, steady scrolling.' },
          { name: 'Context Switcher', count: 8, description: 'High domain switch frequency, short active tab durations.' },
          { name: 'Passive Lurker', count: 10, description: 'Extended idle state durations, low interaction score.' },
          { name: 'Anomalous Explorer', count: 5, description: 'Late active hours (00:00 - 05:00), rapid scroll velocity.' }
        ],
        pcaExplainedVarianceRatio: [0.55, 0.32],
        totalVarianceExplained: 0.87,
        pcaData: []
      });
    }

    try {
      const mlProfileResponse = await axios.post(`${ML_ENGINE_URL}/api/profile`, { records: rawRecords }, { timeout: 6000 });
      return res.json({
        success: true,
        isBaseline: false,
        ...mlProfileResponse.data
      });
    } catch (mlErr) {
      console.warn('ML Engine /api/profile unavailable, building node profile:', mlErr.message);
      
      // Fallback profiling structure
      res.json({
        success: true,
        isFallback: true,
        totalVarianceExplained: 0.88,
        pcaExplainedVarianceRatio: [0.58, 0.30],
        archetypes: [
          { name: 'Focused Researcher', count: Math.floor(rawRecords.length * 0.4) },
          { name: 'Context Switcher', count: Math.floor(rawRecords.length * 0.3) },
          { name: 'Passive Lurker', count: Math.floor(rawRecords.length * 0.2) },
          { name: 'Anomalous Explorer', count: Math.floor(rawRecords.length * 0.1) }
        ],
        rawCount: rawRecords.length
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route POST /api/telemetry/seed
 * @desc  Populate database with realistic synthetic telemetry records for instant demonstration
 */
app.post('/api/telemetry/seed', async (req, res) => {
  try {
    const domains = ['github.com', 'stackoverflow.com', 'news.ycombinator.com', 'reddit.com', 'medium.com', 'unknown-phishing-site.xyz'];
    const users = ['usr_alice', 'usr_bob', 'usr_charlie', 'usr_scanner_bot'];
    const archetypesList = ['Focused Researcher', 'Context Switcher', 'Passive Lurker', 'Anomalous Explorer'];

    const syntheticRecords = [];
    const now = Date.now();

    for (let i = 0; i < 80; i++) {
      const isAnomalyPattern = Math.random() < 0.18;
      const user = users[Math.floor(Math.random() * users.length)];
      const activeHour = isAnomalyPattern ? Math.floor(Math.random() * 4) + 1 : Math.floor(Math.random() * 12) + 9;
      const clusterId = isAnomalyPattern ? 3 : Math.floor(Math.random() * 3);

      const record = {
        userId: user,
        sessionId: 'sess_' + Math.floor(100 + Math.random() * 900),
        activeTabDuration: isAnomalyPattern ? Math.floor(Math.random() * 5) + 1 : Math.floor(Math.random() * 180) + 30,
        domainSwitches: isAnomalyPattern ? Math.floor(Math.random() * 25) + 15 : Math.floor(Math.random() * 5),
        idleStateDuration: isAnomalyPattern ? Math.floor(Math.random() * 300) + 60 : Math.floor(Math.random() * 20),
        scrollVelocity: isAnomalyPattern ? Math.floor(Math.random() * 800) + 400 : Math.floor(Math.random() * 200) + 30,
        mouseActivityScore: isAnomalyPattern ? Math.floor(Math.random() * 90) + 60 : Math.floor(Math.random() * 40) + 5,
        activeHour: activeHour,
        currentDomain: domains[Math.floor(Math.random() * domains.length)],
        timestamp: new Date(now - i * 15 * 60 * 1000).toISOString(),
        anomalyScore: isAnomalyPattern ? parseFloat((70 + Math.random() * 28).toFixed(2)) : parseFloat((5 + Math.random() * 25).toFixed(2)),
        isAnomaly: isAnomalyPattern,
        archetype: archetypesList[clusterId],
        clusterId: clusterId
      };

      syntheticRecords.push(await saveTelemetryRecord(record));
    }

    res.json({
      success: true,
      message: `Successfully seeded ${syntheticRecords.length} telemetry records into system database`,
      count: syntheticRecords.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Ingestion API Server running on port ${PORT}`);
  console.log(`📡 Ingestion Endpoint: http://localhost:${PORT}/api/telemetry`);
  console.log(`📊 Profile Endpoint:   http://localhost:${PORT}/api/profile`);
  console.log(`===================================================`);
});

