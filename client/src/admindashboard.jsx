import React, { useState, useCallback, useEffect } from 'react';
import { 
  Menu, Home, Calendar, Users, FileText, Activity, 
  Settings, LogOut, User, Search, MoreVertical, 
  CheckCircle, Clock, XCircle, DollarSign, TrendingUp,
  Shield, Database, X, AlertCircle, RefreshCw
} from 'lucide-react';
import logoImg from './assets/logo.png';
import API from './api';

// FIX: Animation keyframes moved to tailwind.config.js (same as Dashboard.jsx).
// Add to tailwind.config.js under theme.extend:
//   keyframes: {
//     fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
//     scaleIn: { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
//   },
//   animation: { fadeIn: 'fadeIn 0.2s ease-out', scaleIn: 'scaleIn 0.2s ease-out' },

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_BADGE = {
  confirmed: 'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700'}`}>
    {status === 'confirmed' && <CheckCircle className="w-3.5 h-3.5" />}
    {status === 'pending'   && <Clock       className="w-3.5 h-3.5" />}
    {status === 'completed' && <CheckCircle className="w-3.5 h-3.5" />}
    {status === 'cancelled' && <XCircle     className="w-3.5 h-3.5" />}
    {status.charAt(0).toUpperCase() + status.slice(1)}
  </span>
);

// ─── Audit action badge colors ────────────────────────────────────────────────
const getActionBadgeClass = (action = '') => {
  if (action.includes('FAIL') || action.includes('CANCEL') || action.includes('DEACTIVAT') || action.includes('FORBIDDEN'))
    return 'bg-red-100 text-red-700';
  if (action.includes('LOGIN') || action.includes('REGISTER') || action.includes('VERIFIED'))
    return 'bg-blue-100 text-blue-700';
  if (action.includes('CREATE') || action.includes('REACTIVAT') || action.includes('SUCCESS'))
    return 'bg-green-100 text-green-700';
  if (action.includes('UPDATE') || action.includes('CHANGED') || action.includes('ROLE'))
    return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-700';
};

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_STATS = {
  totalAppointments:   248,
  activeUsers:         156,
  completedToday:      12,
  revenue:             45600,
  pendingAppointments: 18,
  cancelledToday:      3,
};

const MOCK_APPOINTMENTS = [
  { id: 1, petName: 'Max',     owner: 'John Smith',   service: 'Vaccination',   date: '2026-02-15', time: '10:00 AM', status: 'confirmed', vet: 'Dr. Sarah Johnson' },
  { id: 2, petName: 'Bella',   owner: 'Maria Santos', service: 'Check-up',      date: '2026-02-15', time: '11:30 AM', status: 'pending',   vet: 'Dr. Bert Cruz'     },
  { id: 3, petName: 'Charlie', owner: 'Robert Lee',   service: 'Grooming',      date: '2026-02-15', time: '02:00 PM', status: 'completed', vet: 'Dr. Maria Santos'  },
  { id: 4, petName: 'Luna',    owner: 'Emma Wilson',  service: 'Deworming',     date: '2026-02-15', time: '03:30 PM', status: 'cancelled', vet: 'Dr. Sarah Johnson' },
  { id: 5, petName: 'Rocky',   owner: 'David Chen',   service: 'Spay & Neuter', date: '2026-02-16', time: '09:00 AM', status: 'pending',   vet: 'Dr. Bert Cruz'     },
];

const MOCK_USERS = [
  { id: 1, name: 'Alice Gong',   email: 'alice@email.com',  pets: 2, joined: '2025-12-10', status: 'active'   },
  { id: 2, name: 'John Smith',   email: 'john@email.com',   pets: 1, joined: '2026-01-05', status: 'active'   },
  { id: 3, name: 'Maria Santos', email: 'maria@email.com',  pets: 3, joined: '2025-11-20', status: 'active'   },
  { id: 4, name: 'Robert Lee',   email: 'robert@email.com', pets: 1, joined: '2026-01-15', status: 'inactive' },
  { id: 5, name: 'Emma Wilson',  email: 'emma@email.com',   pets: 2, joined: '2025-12-28', status: 'active'   },
];

const MOCK_RECORDS = [
  { id: 1, petName: 'Max',     owner: 'John Smith',   recordType: 'Vaccination Record', date: '2026-02-10', blockchainHash: '0x7a8f...3c2d' },
  { id: 2, petName: 'Bella',   owner: 'Maria Santos', recordType: 'Medical History',    date: '2026-02-12', blockchainHash: '0x9b4e...5f1a' },
  { id: 3, petName: 'Charlie', owner: 'Robert Lee',   recordType: 'Lab Results',        date: '2026-02-14', blockchainHash: '0x3d2c...8a7b' },
  { id: 4, petName: 'Luna',    owner: 'Emma Wilson',  recordType: 'Prescription',       date: '2026-02-13', blockchainHash: '0x6f8e...2d4c' },
];

const BLOCKCHAIN = {
  network:         'Ethereum Sepolia Testnet',
  contractAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  totalRecords:    342,
  lastBlockHeight: 5847293,
  gasPrice:        '12 Gwei',
  status:          'Connected',
};

// ─── AdminDashboard ───────────────────────────────────────────────────────────
const AdminDashboard = ({ onLogout }) => {
  const [isSidebarOpen,     setIsSidebarOpen]     = useState(false);
  const [currentView,       setCurrentView]       = useState('overview');
  const [searchQuery,       setSearchQuery]       = useState('');
  const [showModal,         setShowModal]         = useState(false);
  const [selectedItem,      setSelectedItem]      = useState(null);
  const [appointmentFilter, setAppointmentFilter] = useState('all');
  const [appointments,      setAppointments]      = useState(MOCK_APPOINTMENTS);

  // ── Audit log state ───────────────────────────────────────────────────────
  const [auditLogs,    setAuditLogs]    = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError,   setAuditError]   = useState(null);
  const [auditFilter,  setAuditFilter]  = useState('all');
  const [auditPage,    setAuditPage]    = useState(1);
  const [auditMeta,    setAuditMeta]    = useState({ total: 0, pages: 1 });
  const AUDIT_LIMIT = 50;

  // Map UI filter tabs → backend action query param
  const AUDIT_ACTION_MAP = {
    auth:         ['LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGOUT', 'REGISTER', 'EMAIL_VERIFIED', 'RESEND_VERIFICATION'],
    appointments: ['APPOINTMENT_CREATED', 'APPOINTMENT_UPDATED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_STATUS_CHANGED'],
    users:        ['USER_DEACTIVATED', 'USER_REACTIVATED', 'USER_ROLE_CHANGED'],
    errors:       ['LOGIN_FAIL', 'FORBIDDEN_ACCESS'],
  };

  // ── Fetch audit logs ──────────────────────────────────────────────────────
  const fetchAuditLogs = useCallback(async (page = 1) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      // Backend supports ?action= for single action; for multi-action filters
      // we fetch all and filter client-side (backend already limits to 50/page)
      const params = new URLSearchParams({ page, limit: AUDIT_LIMIT });
      const res = await API.get(`/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const { data, total, pages } = res.data;
      setAuditLogs(data);
      setAuditMeta({ total, pages });
      setAuditPage(page);
    } catch (err) {
      setAuditError('Failed to load audit logs. Please try again.');
      console.error('Audit log fetch error:', err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'audit') fetchAuditLogs(1);
  }, [currentView, auditFilter, fetchAuditLogs]);

  // ── Derived: client-side filter on current page ───────────────────────────
  const filteredAuditLogs = auditLogs.filter(log => {
    if (auditFilter === 'all') return true;
    const actions = AUDIT_ACTION_MAP[auditFilter] ?? [];
    return actions.includes(log.action);
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await API.post('/api/logout', {}, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('token');
      onLogout();
    }
  }, [onLogout]);

  // ── Appointments ──────────────────────────────────────────────────────────
  const handleStatusChange = useCallback((appointmentId, newStatus) => {
    setAppointments(prev => prev.map(apt =>
      apt.id === appointmentId ? { ...apt, status: newStatus } : apt
    ));
    setShowModal(false);
  }, []);

  const getFilteredAppointments = useCallback(() => {
    if (appointmentFilter === 'all') return appointments;
    return appointments.filter(apt => apt.status === appointmentFilter);
  }, [appointments, appointmentFilter]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-white flex flex-col transition-all duration-300 ease-in-out relative z-30 shadow-lg border-r border-gray-200`}>
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          <button onClick={() => setIsSidebarOpen(o => !o)} className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-700" aria-label="Toggle sidebar">
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-6 overflow-hidden">
          <div className="space-y-2 px-2">
            {[
              { view: 'overview',     label: 'Overview',        El: <Home     className="w-5 h-5 flex-shrink-0" /> },
              { view: 'appointments', label: 'Appointments',    El: <Calendar className="w-5 h-5 flex-shrink-0" /> },
              { view: 'users',        label: 'Users',           El: <Users    className="w-5 h-5 flex-shrink-0" /> },
              { view: 'records',      label: 'Medical Records', El: <FileText className="w-5 h-5 flex-shrink-0" /> },
              { view: 'blockchain',   label: 'Blockchain',      El: <Database className="w-5 h-5 flex-shrink-0" /> },
              { view: 'audit',        label: 'Audit Logs',      El: <Activity className="w-5 h-5 flex-shrink-0" /> },
              { view: 'settings',     label: 'Settings',        El: <Settings className="w-5 h-5 flex-shrink-0" /> },
            ].map(({ view, label, El }) => (
              <button
                key={view}
                onClick={() => setCurrentView(view)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${currentView === view ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                title={label}
              >
                {El}
                <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-200">
          <div className={`flex items-center gap-3 p-2 rounded-lg ${!isSidebarOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-[#099FAD] flex items-center justify-center text-white flex-shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'}`}>
              <p className="text-sm font-medium text-gray-700 truncate">Admin</p>
              <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-[#099FAD] transition-colors flex items-center gap-1 mt-0.5">
                <LogOut className="w-3 h-3" />
                Log out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 h-screen overflow-y-auto bg-gray-50">
        <div className="min-h-full">

          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-20">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="VetConnect" className="w-8 h-8 object-contain" />
              <span className="text-xl font-semibold text-[#099FAD]">VetConnect Admin</span>
            </div>
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">Administrator</p>
                <p className="text-xs text-gray-500">admin@vetconnect.com</p>
              </div>
              <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-[#099FAD] hover:bg-gray-100 rounded-lg transition-colors" title="Log out">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="p-6">

            {/* ── OVERVIEW ── */}
            {currentView === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard Overview</h1>
                  <p className="text-sm text-gray-500">Welcome back, Administrator</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {[
                    { label: 'Total Appointments', value: MOCK_STATS.totalAppointments,       IconEl: <Calendar     className="w-5 h-5 text-[#099FAD]"  />, trend: true  },
                    { label: 'Active Users',        value: MOCK_STATS.activeUsers,            IconEl: <Users        className="w-5 h-5 text-[#099FAD]"  />, trend: true  },
                    { label: 'Completed Today',     value: MOCK_STATS.completedToday,         IconEl: <CheckCircle  className="w-5 h-5 text-green-500"  />, trend: false },
                    { label: 'Revenue (MTD)',        value: `₱${MOCK_STATS.revenue.toLocaleString()}`, IconEl: <DollarSign className="w-5 h-5 text-[#099FAD]"  />, trend: true  },
                    { label: 'Pending',             value: MOCK_STATS.pendingAppointments,    IconEl: <Clock        className="w-5 h-5 text-yellow-500" />, trend: false },
                    { label: 'Cancelled Today',     value: MOCK_STATS.cancelledToday,         IconEl: <XCircle      className="w-5 h-5 text-red-500"    />, trend: false },
                  ].map(({ label, value, IconEl, trend }) => (
                    <div key={label} className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        {IconEl}
                        {trend && <TrendingUp className="w-4 h-4 text-green-500" />}
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{value}</p>
                      <p className="text-xs text-gray-500 mt-1">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Recent Appointments</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{['Pet', 'Owner', 'Service', 'Date & Time', 'Status'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {appointments.slice(0, 5).map(apt => (
                          <tr key={apt.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{apt.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.service}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.date} {apt.time}</td>
                            <td className="px-6 py-4"><StatusBadge status={apt.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── APPOINTMENTS ── */}
            {currentView === 'appointments' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Appointments Management</h1>
                  <p className="text-sm text-gray-500">Manage and track all appointments</p>
                </div>
                <div className="flex gap-2 border-b border-gray-200 pb-4">
                  {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(f => (
                    <button key={f} onClick={() => setAppointmentFilter(f)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all border ${appointmentFilter === f ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30' : 'text-gray-600 hover:bg-gray-50 border-transparent'}`}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{['ID', 'Pet Name', 'Owner', 'Service', 'Date', 'Time', 'Vet', 'Status', 'Actions'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {getFilteredAppointments().map(apt => (
                          <tr key={apt.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{apt.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{apt.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.service}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.date}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.time}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.vet}</td>
                            <td className="px-6 py-4"><StatusBadge status={apt.status} /></td>
                            <td className="px-6 py-4">
                              <button onClick={() => { setSelectedItem(apt); setShowModal(true); }} className="text-[#099FAD] hover:text-[#088a96] transition-colors" aria-label="Manage appointment">
                                <MoreVertical className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── USERS ── */}
            {currentView === 'users' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">User Management</h1>
                  <p className="text-sm text-gray-500">Manage registered users and their pets</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{['ID', 'Name', 'Email', 'Pets', 'Joined', 'Status', 'Actions'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {MOCK_USERS.map(user => (
                          <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{user.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.pets}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.joined}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4"><button className="text-[#099FAD] hover:text-[#088a96] text-sm font-medium">View Details</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── MEDICAL RECORDS ── */}
            {currentView === 'records' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Medical Records</h1>
                  <p className="text-sm text-gray-500">View and manage pet medical records</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{['ID', 'Pet Name', 'Owner', 'Record Type', 'Date', 'Blockchain Hash', 'Actions'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {MOCK_RECORDS.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{record.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{record.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.recordType}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.date}</td>
                            <td className="px-6 py-4"><code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">{record.blockchainHash}</code></td>
                            <td className="px-6 py-4"><button className="text-[#099FAD] hover:text-[#088a96] text-sm font-medium">View Record</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── BLOCKCHAIN ── */}
            {currentView === 'blockchain' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Blockchain Network</h1>
                  <p className="text-sm text-gray-500">Monitor blockchain integration and records</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">Network Status</h2>
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />{BLOCKCHAIN.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { label: 'Network',           value: BLOCKCHAIN.network },
                      { label: 'Contract Address',  value: <code className="text-xs font-mono break-all">{BLOCKCHAIN.contractAddress}</code> },
                      { label: 'Total Records',     value: BLOCKCHAIN.totalRecords },
                      { label: 'Last Block Height', value: BLOCKCHAIN.lastBlockHeight.toLocaleString() },
                      { label: 'Gas Price',         value: BLOCKCHAIN.gasPrice },
                      { label: 'Network Health',    value: (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full w-[95%]" /></div>
                          <span className="text-xs font-medium text-gray-700">95%</span>
                        </div>
                      )},
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 mb-1">{label}</p>
                        <p className="text-sm font-semibold text-gray-900">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900">Recent Blockchain Transactions</h2></div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{['Transaction Hash', 'Type', 'Pet', 'Timestamp', 'Status'].map(h => (
                          <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {MOCK_RECORDS.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4"><code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">{record.blockchainHash}</code></td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.recordType}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{record.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.date}</td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                <CheckCircle className="w-3 h-3" /> Confirmed
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-[#099FAD]/5 to-[#099FAD]/10 rounded-xl border border-[#099FAD]/20 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#099FAD]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield className="w-6 h-6 text-[#099FAD]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart Contract Security</h3>
                      <p className="text-sm text-gray-600 mb-4">All medical records are securely stored on the blockchain with cryptographic hashing. Each record is immutable and traceable, ensuring data integrity and transparency.</p>
                      <div className="flex gap-3">
                        <button className="px-4 py-2 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] transition-colors">View Contract</button>
                        <button className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Verify Records</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── AUDIT LOGS ── */}
            {currentView === 'audit' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Audit Logs</h1>
                    <p className="text-sm text-gray-500">Track all system activity and user actions</p>
                  </div>
                  <button
                    onClick={() => fetchAuditLogs(auditPage)}
                    disabled={auditLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-2 border-b border-gray-200 pb-4">
                  {[
                    { key: 'all',          label: 'All'          },
                    { key: 'auth',         label: 'Auth'         },
                    { key: 'appointments', label: 'Appointments' },
                    { key: 'users',        label: 'Users'        },
                    { key: 'errors',       label: 'Errors'       },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setAuditFilter(key); fetchAuditLogs(1); }}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all border ${auditFilter === key ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30' : 'text-gray-600 hover:bg-gray-50 border-transparent'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Error state */}
                {auditError && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">{auditError}</p>
                  </div>
                )}

                {/* Loading state */}
                {auditLoading && (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <p className="text-sm">Loading audit logs...</p>
                    </div>
                  </div>
                )}

                {/* Table */}
                {!auditLoading && !auditError && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        Showing <span className="font-semibold text-gray-900">{filteredAuditLogs.length}</span> of{' '}
                        <span className="font-semibold text-gray-900">{auditMeta.total}</span> total entries
                      </p>
                      <p className="text-xs text-gray-400">Page {auditPage} of {auditMeta.pages}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            {['Timestamp', 'User', 'Role', 'Action', 'Entity', 'IP Address', 'Detail'].map(h => (
                              <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredAuditLogs.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                                No audit logs found.
                              </td>
                            </tr>
                          ) : (
                            filteredAuditLogs.map((log, i) => (
                              <tr key={log.id ?? i} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                                  {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                                </td>
                                {/* Shows username if joined, falls back to user_id, then anon */}
                                <td className="px-6 py-4 text-sm text-gray-900">
                                  {log.username
                                    ? <span>{log.username} <span className="text-xs text-gray-400">#{log.user_id}</span></span>
                                    : log.user_id
                                      ? <span className="text-gray-500">#{log.user_id}</span>
                                      : <span className="text-gray-400 italic">anon</span>
                                  }
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                  {log.user_role
                                    ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${log.user_role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{log.user_role}</span>
                                    : <span className="text-gray-400">-</span>
                                  }
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getActionBadgeClass(log.action)}`}>
                                    {log.action}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                  {log.entity
                                    ? <>{log.entity}{log.entity_id ? <span className="text-gray-400"> #{log.entity_id}</span> : null}</>
                                    : <span className="text-gray-400">-</span>
                                  }
                                </td>
                                <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap font-mono">
                                  {log.ip_address ?? '-'}
                                </td>
                                <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate" title={log.detail ?? ''}>
                                  {log.detail ?? '-'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {auditMeta.pages > 1 && (
                      <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                        <button
                          onClick={() => fetchAuditLogs(auditPage - 1)}
                          disabled={auditPage <= 1 || auditLoading}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Previous
                        </button>
                        <div className="flex gap-1">
                          {Array.from({ length: Math.min(auditMeta.pages, 7) }, (_, i) => i + 1).map(p => (
                            <button
                              key={p}
                              onClick={() => fetchAuditLogs(p)}
                              className={`w-8 h-8 text-sm rounded-lg transition-colors ${p === auditPage ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => fetchAuditLogs(auditPage + 1)}
                          disabled={auditPage >= auditMeta.pages || auditLoading}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── SETTINGS ── */}
            {currentView === 'settings' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
                  <p className="text-sm text-gray-500">Manage system settings and configurations</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h3>
                    <div className="space-y-4">
                      {[
                        { label: 'Email Notifications',       desc: 'Receive email alerts for new appointments',         defaultChecked: true  },
                        { label: 'Auto-Confirm Appointments', desc: 'Automatically confirm appointments when booked',    defaultChecked: false },
                        { label: 'Blockchain Verification',   desc: 'Require blockchain verification for all records',   defaultChecked: true  },
                      ].map(({ label, desc, defaultChecked }) => (
                        <div key={label} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{label}</p>
                            <p className="text-xs text-gray-500">{desc}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked={defaultChecked} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#099FAD]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#099FAD]" />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinic Information</h3>
                    <div className="space-y-4">
                      {[
                        { label: 'Clinic Name',   type: 'text',  value: 'VetConnect Clinic'      },
                        { label: 'Contact Email', type: 'email', value: 'contact@vetconnect.com' },
                        { label: 'Phone Number',  type: 'tel',   value: '+63 912 345 6789'       },
                      ].map(({ label, type, value }) => (
                        <div key={label}>
                          <label className="text-sm font-medium text-gray-700 block mb-2">{label}</label>
                          <input type={type} defaultValue={value} className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4">
                    <button className="px-6 py-2.5 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] transition-colors">Save Changes</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ── Appointment action modal ── */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl animate-scaleIn">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-all" aria-label="Close">
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-5">Manage Appointment</h3>
            <div className="space-y-4 mb-6">
              {[
                { label: 'Pet Name',    value: selectedItem.petName  },
                { label: 'Owner',       value: selectedItem.owner    },
                { label: 'Service',     value: selectedItem.service  },
                { label: 'Date & Time', value: `${selectedItem.date} ${selectedItem.time}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-base font-semibold text-gray-900">{value}</p>
                </div>
              ))}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Current Status</p>
                <StatusBadge status={selectedItem.status} />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-3">Update Status:</p>
            <div className="space-y-2">
              <button onClick={() => handleStatusChange(selectedItem.id, 'confirmed')}  className="w-full px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium">Confirm Appointment</button>
              <button onClick={() => handleStatusChange(selectedItem.id, 'completed')} className="w-full px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">Mark as Completed</button>
              <button onClick={() => handleStatusChange(selectedItem.id, 'cancelled')} className="w-full px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium">Cancel Appointment</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;