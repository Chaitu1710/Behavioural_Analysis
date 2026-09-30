const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      index: true
    },
    activeTabDuration: {
      type: Number,
      default: 0,
      min: 0
    },
    domainSwitches: {
      type: Number,
      default: 0,
      min: 0
    },
    idleStateDuration: {
      type: Number,
      default: 0,
      min: 0
    },
    scrollVelocity: {
      type: Number,
      default: 0,
      min: 0
    },
    mouseActivityScore: {
      type: Number,
      default: 0,
      min: 0
    },
    activeHour: {
      type: Number,
      required: true,
      min: 0,
      max: 23
    },
    currentDomain: {
      type: String,
      default: 'unknown'
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Enriched fields from ML Engine
    anomalyScore: {
      type: Number,
      default: 0.0
    },
    isAnomaly: {
      type: Boolean,
      default: false
    },
    archetype: {
      type: String,
      default: 'Unclassified'
    },
    clusterId: {
      type: Number,
      default: -1
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying recent telemetry by user
TelemetrySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Telemetry', TelemetrySchema);
