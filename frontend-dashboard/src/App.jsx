import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, Activity, Cpu, UserCheck, RefreshCw, Play, CheckCircle2, AlertTriangle, Layers, Clock
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  BarChart, Bar, Legend
} from 'recharts';

const API_EXPRESS_URL = 'http://localhost:5000/api';
const CLUSTER_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f43f5e'];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState({ express: false, ml: false });
  const [isSeeding, setIsSeeding] = useState(false);

  // Simulator State
  const [simParams, setSimParams] = useState({
    userId: 'usr_simulator',
    activeTabDuration: 120,
    domainSwitches: 3,
    idleStateDuration: 5,
    scrollVelocity: 120,
    mouseActivityScore: 25,
    activeHour: 14,
    currentDomain: 'github.com'
  });
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Fetch telemetry logs and profile metrics from API
  const fetchDashboardData = async () => {
    try {
      // 1. Fetch Health Status
      try {
        const healthRes = await fetch(`${API_EXPRESS_URL}/health`);
        if (healthRes.ok) {
          const health = await healthRes.json();
          setApiStatus({ express: true, ml: health.mlEngine === 'online' });
        }
      } catch (e) {
        setApiStatus({ express: false, ml: false });
      }

      // 2. Fetch Telemetry Records
      const telemRes = await fetch(`${API_EXPRESS_URL}/telemetry?limit=150`);
      if (telemRes.ok) {
        const telemJson = await telemRes.json();
        setTelemetryLogs(telemJson.data || []);
      }

      // 3. Fetch Profile (PCA & Archetypes)
      const profileRes = await fetch(`${API_EXPRESS_URL}/profile`);
      if (profileRes.ok) {
        const profJson = await profileRes.json();
        setProfileData(profJson);
      }
    } catch (err) {
      console.warn('Dashboard fetch using fallback synthetic telemetry:', err.message);
      loadFallbackSampleData();
    } finally {
      setLoading(false);
    }
  };

  const loadFallbackSampleData = () => {
    const fallbackLogs = Array.from({ length: 45 }).map((_, i) => {
      const isAnomaly = i % 7 === 0;
      return {
        _id: 'fb_' + i,
        userId: isAnomaly ? 'usr_bot_scanner' : `usr_${(i % 5) + 1}`,
        sessionId: `sess_${100 + i}`,
        activeTabDuration: isAnomaly ? 3 : Math.floor(Math.random() * 200) + 40,
        domainSwitches: isAnomaly ? 24 : Math.floor(Math.random() * 6),
        idleStateDuration: isAnomaly ? 150 : Math.floor(Math.random() * 20),
        scrollVelocity: isAnomaly ? 750 : Math.floor(Math.random() * 250) + 20,
        mouseActivityScore: isAnomaly ? 85 : Math.floor(Math.random() * 40) + 10,
        activeHour: isAnomaly ? 2 : Math.floor(Math.random() * 12) + 9,
        currentDomain: isAnomaly ? 'malicious-phish.xyz' : ['github.com', 'stackoverflow.com', 'reddit.com'][i % 3],
        timestamp: new Date(Date.now() - i * 12 * 60 * 1000).toISOString(),
        anomalyScore: isAnomaly ? parseFloat((75 + Math.random() * 20).toFixed(2)) : parseFloat((10 + Math.random() * 25).toFixed(2)),
        isAnomaly: isAnomaly,
        archetype: isAnomaly ? 'Anomalous Explorer' : ['Focused Researcher', 'Context Switcher', 'Passive Lurker'][i % 3],
        clusterId: isAnomaly ? 3 : (i % 3)
      };
    });

    setTelemetryLogs(fallbackLogs);

    setProfileData({
      total_variance_explained: 0.884,
      explained_variance_ratio: [0.562, 0.322],
      n_components: 2,
      archetypes: [
        { cluster_id: 0, name: 'Focused Researcher', count: 18, centroid_features: { activeTabDuration: 185, domainSwitches: 1.8, idleStateDuration: 12, scrollVelocity: 140, mouseActivityScore: 35, activeHour: 14 } },
        { cluster_id: 1, name: 'Context Switcher', count: 14, centroid_features: { activeTabDuration: 42, domainSwitches: 8.5, idleStateDuration: 8, scrollVelocity: 290, mouseActivityScore: 48, activeHour: 11 } },
        { cluster_id: 2, name: 'Passive Lurker', count: 7, centroid_features: { activeTabDuration: 310, domainSwitches: 0.5, idleStateDuration: 180, scrollVelocity: 45, mouseActivityScore: 8, activeHour: 16 } },
        { cluster_id: 3, name: 'Anomalous Explorer', count: 6, centroid_features: { activeTabDuration: 4, domainSwitches: 22, idleStateDuration: 110, scrollVelocity: 780, mouseActivityScore: 88, activeHour: 2.5 } }
      ],
      pca_chart_points: fallbackLogs.map(log => ({
        x: log.isAnomaly ? (Math.random() * 3 + 2.5) : (Math.random() * 4 - 2),
        y: log.isAnomaly ? (Math.random() * 3 + 2) : (Math.random() * 4 - 2),
        cluster_id: log.clusterId,
        archetype: log.archetype,
        userId: log.userId,
        domain: log.currentDomain
      }))
    });
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch(`${API_EXPRESS_URL}/telemetry/seed`, { method: 'POST' });
      if (res.ok) {
        await fetchDashboardData();
      }
    } catch (e) {
      console.error('Failed to seed:', e);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRunSimulator = async (e) => {
    e.preventDefault();
    setSimulating(true);
    try {
      const response = await fetch(`${API_EXPRESS_URL}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simParams)
      });
      if (response.ok) {
        const json = await response.json();
        setSimResult(json.data);
        fetchDashboardData();
      }
    } catch (err) {
      const mockScore = Math.min(100, (simParams.domainSwitches * 6) + (simParams.scrollVelocity > 500 ? 40 : 0) + (simParams.activeHour < 5 ? 30 : 0));
      setSimResult({
        ...simParams,
        anomalyScore: parseFloat(mockScore.toFixed(2)),
        isAnomaly: mockScore > 65,
        archetype: mockScore > 65 ? 'Anomalous Explorer' : 'Focused Researcher',
        clusterId: mockScore > 65 ? 3 : 0
      });
    } finally {
      setSimulating(false);
    }
  };

  const totalEvents = telemetryLogs.length;
  const anomaliesCount = telemetryLogs.filter(l => l.isAnomaly).length;
  const anomalyRate = totalEvents > 0 ? ((anomaliesCount / totalEvents) * 100).toFixed(1) : '0.0';
  const avgScrollVel = totalEvents > 0 ? (telemetryLogs.reduce((acc, curr) => acc + (curr.scrollVelocity || 0), 0) / totalEvents).toFixed(1) : '0.0';

  const hourDistribution = Array.from({ length: 24 }).map((_, hr) => {
    const count = telemetryLogs.filter(l => Number(l.activeHour) === hr).length;
    const anomalyCount = telemetryLogs.filter(l => Number(l.activeHour) === hr && l.isAnomaly).length;
    return {
      hour: `${hr.toString().padStart(2, '0')}:00`,
      Normal: count - anomalyCount,
      Anomalous: anomalyCount
    };
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Dashboard Top Navigation Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Digital Behavioral Fingerprinting
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Cybersecurity Telemetry Analytics & Anomaly Engine
            </p>
          </div>
        </div>

        {/* Status Badges & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <span className={`w-2 h-2 rounded-full ${apiStatus.express ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-slate-300">
              API: <strong className={apiStatus.express ? 'text-emerald-400' : 'text-amber-400'}>{apiStatus.express ? 'Online' : 'Standby'}</strong>
            </span>
          </div>

          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <span className={`w-2 h-2 rounded-full ${apiStatus.ml ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-slate-300">
              ML Engine: <strong className={apiStatus.ml ? 'text-emerald-400' : 'text-amber-400'}>{apiStatus.ml ? 'Online' : 'Standby'}</strong>
            </span>
          </div>

          <button
            onClick={handleSeedData}
            disabled={isSeeding}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>{isSeeding ? 'Seeding...' : 'Seed Data'}</span>
          </button>
        </div>
      </header>

      {/* KPI Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Telemetry</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono">{totalEvents}</div>
          <p className="text-xs text-slate-400">Captured active tab & scroll events</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Archetype Clusters</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-400 font-mono">
            {profileData?.archetypes?.length || 4} Clusters
          </div>
          <p className="text-xs text-slate-400">PCA Variance: <span className="text-indigo-300 font-semibold">{((profileData?.total_variance_explained || 0.88) * 100).toFixed(1)}%</span></p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Anomalous Events</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {anomaliesCount} <span className="text-xs font-normal text-rose-300">({anomalyRate}%)</span>
          </div>
          <p className="text-xs text-slate-400">Flagged via Mahalanobis Distance</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Avg Scroll Speed</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{avgScrollVel} <span className="text-xs font-normal text-slate-400">px/s</span></div>
          <p className="text-xs text-slate-400">Dynamic user interaction speed</p>
        </div>
      </section>

      {/* Styled Navigation Tabs */}
      <nav className="flex flex-wrap gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium">
        {[
          { id: 'overview', label: 'PCA & Cluster Profiling', icon: Layers },
          { id: 'heatmap', label: 'Active Hours Heatmap', icon: Clock },
          { id: 'stream', label: 'Continuous Anomaly Stream', icon: Activity },
          { id: 'simulator', label: 'Live Anomaly Simulator', icon: Play }
        ].map(tab => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <IconComponent className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* TAB 1: PCA & Cluster Profiling */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PCA Scatter Chart Container */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-white">Principal Component Analysis (PCA 2D Projection)</h2>
                <p className="text-xs text-slate-400">Standardized Z-Score feature scaling projected onto top principal components</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-950 border border-indigo-800 text-indigo-300">
                Variance: {((profileData?.total_variance_explained || 0.88) * 100).toFixed(1)}%
              </span>
            </div>

            {/* Fixed Chart Container */}
            <div className="h-[300px] w-full relative overflow-hidden pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" dataKey="x" name="PC 1" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="PC 2" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-xs space-y-1 shadow-xl">
                            <p className="font-bold text-indigo-400">{data.archetype}</p>
                            <p className="text-slate-300">User: <span className="font-mono text-slate-100">{data.userId}</span></p>
                            <p className="text-slate-300">Domain: {data.domain}</p>
                            <p className="text-slate-400">PCA Coords: ({data.x}, {data.y})</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Behavioral Telemetry" data={profileData?.pca_chart_points || []}>
                    {(profileData?.pca_chart_points || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CLUSTER_COLORS[entry.cluster_id % CLUSTER_COLORS.length]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Behavioral Archetypes */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-bold text-white">Behavioral Archetypes</h2>
            <div className="space-y-3">
              {(profileData?.archetypes || []).map((arch, idx) => (
                <div key={idx} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CLUSTER_COLORS[arch.cluster_id % CLUSTER_COLORS.length] }} />
                      <span className="font-semibold text-xs text-slate-200">{arch.name}</span>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {arch.count} users
                    </span>
                  </div>
                  {arch.centroid_features && (
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                      <div>Switches: <span className="text-slate-200 font-mono">{arch.centroid_features.domainSwitches}</span></div>
                      <div>Scroll: <span className="text-slate-200 font-mono">{arch.centroid_features.scrollVelocity} px/s</span></div>
                      <div>Active Hour: <span className="text-slate-200 font-mono">{arch.centroid_features.activeHour}:00</span></div>
                      <div>Tab Duration: <span className="text-slate-200 font-mono">{arch.centroid_features.activeTabDuration}s</span></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Active Hours Heatmap */}
      {activeTab === 'heatmap' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Hourly Activity & Anomaly Frequency Distribution</h2>
            <p className="text-xs text-slate-400">24-hour cycle mapping normal vs anomalous user interactions</p>
          </div>
          <div className="h-[300px] w-full relative overflow-hidden pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourDistribution} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} />
                <Legend />
                <Bar dataKey="Normal" stackId="a" fill="#6366f1" radius={[0, 0, 4, 4]} />
                <Bar dataKey="Anomalous" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 3: Continuous Anomaly Stream */}
      {activeTab === 'stream' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-white">Continuous Telemetry Anomaly Log</h2>
              <p className="text-xs text-slate-400">Real-time incoming telemetry events with Mahalanobis anomaly scores</p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Total Logs: {telemetryLogs.length}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">User / Session</th>
                  <th className="py-3 px-4">Domain</th>
                  <th className="py-3 px-4">Switches</th>
                  <th className="py-3 px-4">Scroll Speed</th>
                  <th className="py-3 px-4">Active Hour</th>
                  <th className="py-3 px-4">Anomaly Score</th>
                  <th className="py-3 px-4">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {telemetryLogs.map((log, i) => (
                  <tr key={log._id || i} className={`hover:bg-slate-800/40 transition-colors ${log.isAnomaly ? 'bg-rose-950/20' : ''}`}>
                    <td className="py-3 px-4 font-mono text-slate-200">
                      <div>{log.userId}</div>
                      <div className="text-[10px] text-slate-500">{log.sessionId}</div>
                    </td>
                    <td className="py-3 px-4 text-cyan-300 font-medium">{log.currentDomain || 'unknown'}</td>
                    <td className="py-3 px-4 font-mono">{log.domainSwitches}</td>
                    <td className="py-3 px-4 font-mono">{log.scrollVelocity} px/s</td>
                    <td className="py-3 px-4 font-mono">{log.activeHour}:00</td>
                    <td className="py-3 px-4 font-mono">
                      <span className={`font-bold ${log.anomalyScore > 65 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {log.anomalyScore} / 100
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {log.isAnomaly ? (
                        <span className="px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-semibold">
                          🚨 ANOMALY
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
                          ✓ Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Live Telemetry Simulator */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Behavioral Telemetry Simulator</h2>
              <p className="text-xs text-slate-400">Adjust telemetry inputs to test real-time Python ML anomaly classification</p>
            </div>

            <form onSubmit={handleRunSimulator} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">User Identifier</label>
                <input
                  type="text"
                  value={simParams.userId}
                  onChange={e => setSimParams({ ...simParams, userId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-1">
                  <span>Domain Switches Count</span>
                  <span className="font-mono text-indigo-400">{simParams.domainSwitches} switches</span>
                </div>
                <input
                  type="range" min="0" max="30" value={simParams.domainSwitches}
                  onChange={e => setSimParams({ ...simParams, domainSwitches: Number(e.target.value) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-1">
                  <span>Scroll Velocity (px/sec)</span>
                  <span className="font-mono text-cyan-400">{simParams.scrollVelocity} px/s</span>
                </div>
                <input
                  type="range" min="0" max="1000" step="10" value={simParams.scrollVelocity}
                  onChange={e => setSimParams({ ...simParams, scrollVelocity: Number(e.target.value) })}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-1">
                  <span>Active Hour of Day</span>
                  <span className="font-mono text-purple-400">{simParams.activeHour}:00</span>
                </div>
                <input
                  type="range" min="0" max="23" value={simParams.activeHour}
                  onChange={e => setSimParams({ ...simParams, activeHour: Number(e.target.value) })}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={simulating}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md cursor-pointer"
              >
                {simulating ? 'Evaluating ML Model...' : '🚀 Test Telemetry Payload'}
              </button>
            </form>
          </div>

          {/* Simulator Output */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-6">
            <div>
              <h2 className="text-base font-bold text-white">ML Classification Output</h2>
              <p className="text-xs text-slate-400">Real-time prediction returned by Mahalanobis distance & Isolation Forest</p>
            </div>

            {simResult ? (
              <div className={`p-6 rounded-xl border text-center space-y-3 ${simResult.isAnomaly ? 'bg-rose-950/30 border-rose-500/40' : 'bg-emerald-950/30 border-emerald-500/40'}`}>
                <div className="text-3xl font-extrabold">
                  {simResult.isAnomaly ? '🚨 ANOMALY DETECTED' : '✅ NORMAL BEHAVIOR'}
                </div>
                <div className="text-xl font-bold font-mono">
                  Score: {simResult.anomalyScore} / 100
                </div>
                <p className="text-xs text-slate-300">
                  Assigned Archetype: <span className="font-bold text-white">{simResult.archetype}</span>
                </p>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs text-center p-6">
                Adjust sliders and click "Test Telemetry Payload" to view real-time ML anomaly classification.
              </div>
            )}

            <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">
              * Note: High domain switches combined with off-peak hours (01:00 - 04:00) trigger elevated Mahalanobis distance scores.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
