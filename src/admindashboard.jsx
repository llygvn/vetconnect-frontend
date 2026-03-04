import React, { useState, useRef, useEffect } from 'react';
import {
  Menu, Home, Calendar, Users, FileText,
  Settings, LogOut, User, Search, MoreVertical,
  CheckCircle, Clock, XCircle, DollarSign, TrendingUp,
  Shield, Database
} from 'lucide-react';
import logoImg from './assets/logo.png';
import blockchainService from './blockchain';

// ============================================================
// ANIMATION STYLES
// ============================================================
const modalStyles = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }
  .animate-fadeIn  { animation: fadeIn  0.2s ease-out; }
  .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
`;

// ============================================================
// OOP MODEL CLASSES
// ============================================================

class Appointment {
  constructor({ id, petName, owner, service, date, time, status, vet }) {
    this.id       = id;
    this.petName  = petName;
    this.owner    = owner;
    this.service  = service;
    this.date     = date;
    this.time     = time;
    this.status   = status;
    this.vet      = vet;
  }

  isCompleted()  { return this.status === 'completed';  }
  isPending()    { return this.status === 'pending';    }
  isConfirmed()  { return this.status === 'confirmed';  }
  isCancelled()  { return this.status === 'cancelled';  }

  getStatusBadgeClass() {
    const map = {
      confirmed: 'bg-green-100 text-green-700',
      pending:   'bg-yellow-100 text-yellow-700',
      completed: 'bg-blue-100 text-blue-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return map[this.status] || 'bg-gray-100 text-gray-700';
  }

  withStatus(newStatus) {
    return new Appointment({ ...this, status: newStatus });
  }
}

class MedicalRecord {
  constructor({ id, petName, owner, recordType, date, blockchainHash = null }) {
    this.id             = id;
    this.petName        = petName;
    this.owner          = owner;
    this.recordType     = recordType;
    this.date           = date;
    this.blockchainHash = blockchainHash;
  }

  isOnChain()  { return this.blockchainHash !== null; }

  setBlockchainHash(hash) {
    return new MedicalRecord({ ...this, blockchainHash: hash });
  }

  toHashPayload() {
    return {
      petName:    this.petName,
      owner:      this.owner,
      recordType: this.recordType,
      date:       this.date,
    };
  }
}

class VetUser {
  constructor({ id, name, email, pets, joined, status }) {
    this.id     = id;
    this.name   = name;
    this.email  = email;
    this.pets   = pets;
    this.joined = joined;
    this.status = status;
  }

  isActive() { return this.status === 'active'; }

  getStatusBadgeClass() {
    return this.isActive()
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-700';
  }
}

class Notification {
  constructor({ id, message, time, read = false }) {
    this.id      = id;
    this.message = message;
    this.time    = time;
    this.read    = read;
  }

  markRead() { return new Notification({ ...this, read: true }); }
}

class BlockchainStatus {
  constructor({ network, contractAddress, totalRecords, lastBlockHeight, gasPrice, status }) {
    this.network         = network;
    this.contractAddress = contractAddress;
    this.totalRecords    = totalRecords;
    this.lastBlockHeight = lastBlockHeight;
    this.gasPrice        = gasPrice;
    this.status          = status;
  }

  isConnected() { return this.status === 'Connected ✅'; }
}

// ============================================================
// STATUS ICON HELPER
// ============================================================
const getStatusIcon = (status) => {
  switch (status) {
    case 'confirmed': return <CheckCircle className="w-4 h-4" />;
    case 'pending':   return <Clock       className="w-4 h-4" />;
    case 'completed': return <CheckCircle className="w-4 h-4" />;
    case 'cancelled': return <XCircle     className="w-4 h-4" />;
    default:          return null;
  }
};

// ============================================================
// SEED DATA  (using OOP model classes)
// ============================================================
const INITIAL_APPOINTMENTS = [
  new Appointment({ id: 1, petName: 'Max',     owner: 'John Smith',   service: 'Vaccination',   date: '2026-02-15', time: '10:00 AM', status: 'confirmed', vet: 'Dr. Sarah Johnson' }),
  new Appointment({ id: 2, petName: 'Bella',   owner: 'Maria Santos', service: 'Check-up',      date: '2026-02-15', time: '11:30 AM', status: 'pending',   vet: 'Dr. Bert Cruz'     }),
  new Appointment({ id: 3, petName: 'Charlie', owner: 'Robert Lee',   service: 'Grooming',      date: '2026-02-15', time: '02:00 PM', status: 'completed', vet: 'Dr. Maria Santos'  }),
  new Appointment({ id: 4, petName: 'Luna',    owner: 'Emma Wilson',  service: 'Deworming',     date: '2026-02-15', time: '03:30 PM', status: 'cancelled', vet: 'Dr. Sarah Johnson' }),
  new Appointment({ id: 5, petName: 'Rocky',   owner: 'David Chen',   service: 'Spay & Neuter', date: '2026-02-16', time: '09:00 AM', status: 'pending',   vet: 'Dr. Bert Cruz'     }),
];

const INITIAL_USERS = [
  new VetUser({ id: 1, name: 'Alice Gong',   email: 'alice@email.com',  pets: 2, joined: '2025-12-10', status: 'active'   }),
  new VetUser({ id: 2, name: 'John Smith',   email: 'john@email.com',   pets: 1, joined: '2026-01-05', status: 'active'   }),
  new VetUser({ id: 3, name: 'Maria Santos', email: 'maria@email.com',  pets: 3, joined: '2025-11-20', status: 'active'   }),
  new VetUser({ id: 4, name: 'Robert Lee',   email: 'robert@email.com', pets: 1, joined: '2026-01-15', status: 'inactive' }),
  new VetUser({ id: 5, name: 'Emma Wilson',  email: 'emma@email.com',   pets: 2, joined: '2025-12-28', status: 'active'   }),
];

const INITIAL_RECORDS = [
  new MedicalRecord({ id: 1, petName: 'Max',     owner: 'John Smith',   recordType: 'Vaccination Record', date: '2026-02-10', blockchainHash: null }),
  new MedicalRecord({ id: 2, petName: 'Bella',   owner: 'Maria Santos', recordType: 'Medical History',    date: '2026-02-12', blockchainHash: null }),
  new MedicalRecord({ id: 3, petName: 'Charlie', owner: 'Robert Lee',   recordType: 'Lab Results',        date: '2026-02-14', blockchainHash: null }),
  new MedicalRecord({ id: 4, petName: 'Luna',    owner: 'Emma Wilson',  recordType: 'Prescription',       date: '2026-02-13', blockchainHash: null }),
];

const INITIAL_NOTIFICATIONS = [
  new Notification({ id: 1, message: 'New appointment request from Alice Gong', time: '10:23 AM' }),
  new Notification({ id: 2, message: 'Appointment #3 has been confirmed',       time: '9:45 AM'  }),
];

const INITIAL_STATS = {
  totalAppointments: 248,
  activeUsers:       156,
  completedToday:    12,
  revenue:           45600,
  pendingAppointments: 18,
  cancelledToday:    3,
};

const INITIAL_BLOCKCHAIN = new BlockchainStatus({
  network:         'Connecting...',
  contractAddress: '0x4e97BB1FE54B64460D0674477917E8d0438757d6',
  totalRecords:    0,
  lastBlockHeight: 0,
  gasPrice:        '—',
  status:          'Connecting...',
});

// ============================================================
// MAIN COMPONENT
// ============================================================
const AdminDashboard = ({ onLogout }) => {

  // ── UI State ──────────────────────────────────────────────
  const [isSidebarOpen,    setIsSidebarOpen]    = useState(false);
  const [currentView,      setCurrentView]      = useState('overview');
  const [searchQuery,      setSearchQuery]      = useState('');
  const [showModal,        setShowModal]        = useState(false);
  const [selectedItem,     setSelectedItem]     = useState(null);
  const [appointmentFilter,setAppointmentFilter]= useState('all');
  const [showNotifications,setShowNotifications]= useState(false);
  const [showContractModal,setShowContractModal]= useState(false);

  // ── Data State (OOP instances) ────────────────────────────
  const [stats,         ]           = useState(INITIAL_STATS);
  const [appointments,  setAppointments]  = useState(INITIAL_APPOINTMENTS);
  const [users,         ]           = useState(INITIAL_USERS);
  const [medicalRecords,setMedicalRecords]= useState(INITIAL_RECORDS);
  const [notifications, setNotifications]= useState(INITIAL_NOTIFICATIONS);
  const [blockchainData,setBlockchainData]= useState(INITIAL_BLOCKCHAIN);

  const notifRef = useRef(null);

  // ── Inject animation CSS ──────────────────────────────────
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = modalStyles;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  // ── Close notifications on outside click ─────────────────
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setShowNotifications(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Connect to Blockchain on mount ───────────────────────
  useEffect(() => {
    const connect = async () => {
      const result = await blockchainService.getStatus();
      if (result.connected) {
        setBlockchainData(new BlockchainStatus({
          network:         result.network,
          contractAddress: result.contractAddress,
          totalRecords:    result.totalRecords,
          lastBlockHeight: 0,
          gasPrice:        '~0 Wei (local)',
          status:          'Connected ✅',
        }));
      } else {
        setBlockchainData(prev => new BlockchainStatus({ ...prev, status: 'Disconnected ❌' }));
      }
    };
    connect();
  }, []);

  // ============================================================
  // HANDLERS
  // ============================================================

  // Update appointment status + push notification
  const handleStatusChange = (appointmentId, newStatus) => {
    const apt = appointments.find(a => a.id === appointmentId);
    setAppointments(prev =>
      prev.map(a => a.id === appointmentId ? a.withStatus(newStatus) : a)
    );
    const notif = new Notification({
      id:      Date.now(),
      message: `Appointment for ${apt?.petName || 'pet'} marked as ${newStatus}.`,
      time:    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setNotifications(prev => [notif, ...prev]);
    setShowModal(false);
  };

  // Store a medical record hash on the blockchain
  const handleStoreOnChain = async (record) => {
    const result = await blockchainService.storeRecord(record.id, record.toHashPayload());
    if (result.success) {
      setMedicalRecords(prev =>
        prev.map(r => r.id === record.id ? r.setBlockchainHash(result.hash) : r)
      );
      // Refresh total records count
      const status = await blockchainService.getStatus();
      if (status.connected) {
        setBlockchainData(prev => new BlockchainStatus({ ...prev, totalRecords: status.totalRecords }));
      }
      alert(`✅ Record stored on blockchain!\nHash: ${result.hash}`);
    } else {
      alert(`❌ Failed: ${result.error}`);
    }
  };

  // Verify a medical record against the blockchain
  const handleVerifyRecord = async (record) => {
    if (!record.isOnChain()) {
      alert('⚠️ This record has not been stored on the blockchain yet.');
      return;
    }
    const result = await blockchainService.verifyRecord(record.id, record.toHashPayload());
    if (result.success) {
      alert(result.isValid
        ? '✅ Record is authentic! Hash matches blockchain.'
        : '❌ Record has been tampered! Hash does not match.');
    } else {
      alert(`❌ Verification error: ${result.error}`);
    }
  };

  // Filter appointments by status tab
  const getFilteredAppointments = () =>
    appointmentFilter === 'all'
      ? appointments
      : appointments.filter(a => a.status === appointmentFilter);

  // Mark all notifications as read
  const handleOpenNotifications = () => {
    setShowNotifications(v => !v);
    setNotifications(prev => prev.map(n => n.markRead()));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">

      {/* ── SIDEBAR ── */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-white flex flex-col transition-all duration-300 ease-in-out relative z-30 shadow-lg border-r border-gray-200`}>

        {/* Hamburger */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-700 cursor-pointer">
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-6 overflow-hidden">
          <div className="space-y-2 px-2">
            {[
              { view: 'overview',    icon: <Home      className="w-5 h-5 flex-shrink-0" />, label: 'Overview'        },
              { view: 'appointments',icon: <Calendar  className="w-5 h-5 flex-shrink-0" />, label: 'Appointments'    },
              { view: 'users',       icon: <Users     className="w-5 h-5 flex-shrink-0" />, label: 'Users'           },
              { view: 'records',     icon: <FileText  className="w-5 h-5 flex-shrink-0" />, label: 'Medical Records' },
              { view: 'blockchain',  icon: <Database  className="w-5 h-5 flex-shrink-0" />, label: 'Blockchain'      },
              { view: 'settings',    icon: <Settings  className="w-5 h-5 flex-shrink-0" />, label: 'Settings'        },
            ].map(({ view, icon, label }) => (
              <button key={view} onClick={() => setCurrentView(view)} title={label}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer ${
                  currentView === view ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {icon}
                <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                  isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
                }`}>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Admin profile */}
        <div className="p-3 border-t border-gray-200">
          <div className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-all ${!isSidebarOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-[#099FAD] flex items-center justify-center text-white flex-shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'}`}>
              <p className="text-sm font-medium text-gray-700 truncate">Admin</p>
              <button onClick={onLogout} className="text-xs text-gray-500 hover:text-[#099FAD] transition-colors cursor-pointer">
                Log out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 h-screen overflow-y-auto bg-gray-50">
        <div className="min-h-full">

          {/* Header */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-20">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="VetConnect" className="w-8 h-8 object-contain" />
              <span className="text-xl font-semibold text-[#099FAD]">VetConnect Admin</span>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Notification Bell */}
              <div className="relative" ref={notifRef}>
                <button onClick={handleOpenNotifications}
                  className="relative p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600 cursor-pointer cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-scaleIn">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">Notifications</p>
                    </div>
                    {notifications.length === 0
                      ? <div className="px-4 py-8 text-center"><p className="text-sm text-gray-400">No notifications</p></div>
                      : <div className="max-h-72 overflow-y-auto">
                          {notifications.map(n => (
                            <div key={n.id} className="px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                              <p className="text-sm text-gray-800">{n.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{n.time}</p>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                )}
              </div>

              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">Administrator</p>
                <p className="text-xs text-gray-500">admin@vetconnect.com</p>
              </div>
            </div>
          </header>

          {/* ── CONTENT AREA ── */}
          <div className="p-6">

            {/* ── OVERVIEW ── */}
            {currentView === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard Overview</h1>
                  <p className="text-sm text-gray-500">Welcome back, Administrator</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { icon: <Calendar    className="w-5 h-5 text-[#099FAD]"  />, value: stats.totalAppointments,   label: 'Total Appointments', trend: true },
                    { icon: <CheckCircle className="w-5 h-5 text-green-500"  />, value: stats.completedToday,      label: 'Completed Today' },
                    { icon: <Clock       className="w-5 h-5 text-yellow-500" />, value: stats.pendingAppointments, label: 'Pending' },
                    { icon: <XCircle     className="w-5 h-5 text-red-500"    />, value: stats.cancelledToday,      label: 'Cancelled Today' },
                  ].map(({ icon, value, label, trend }, i) => (
                    <div key={i} className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        {icon}
                        {trend && <TrendingUp className="w-4 h-4 text-green-500" />}
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{value}</p>
                      <p className="text-xs text-gray-500 mt-1">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Recent Appointments Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Recent Appointments</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Pet', 'Owner', 'Service', 'Date & Time', 'Status'].map(h => (
                            <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {appointments.slice(0, 5).map(apt => (
                          <tr key={apt.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{apt.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.service}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.date} {apt.time}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${apt.getStatusBadgeClass()}`}>
                                {getStatusIcon(apt.status)}
                                {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                              </span>
                            </td>
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

                {/* Filter Tabs */}
                <div className="flex gap-2 border-b border-gray-200 pb-4">
                  {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(f => (
                    <button key={f} onClick={() => setAppointmentFilter(f)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all border cursor-pointer ${
                        appointmentFilter === f
                          ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30'
                          : 'text-gray-600 hover:bg-gray-50 border-transparent'
                      }`}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['ID', 'Pet Name', 'Owner', 'Service', 'Date', 'Time', 'Vet', 'Status', 'Actions'].map(h => (
                            <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
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
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${apt.getStatusBadgeClass()}`}>
                                {getStatusIcon(apt.status)}
                                {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button onClick={() => { setSelectedItem(apt); setShowModal(true); }}
                                className="text-[#099FAD] hover:text-[#088a96] transition-colors cursor-pointer">
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
                        <tr>
                          {['ID', 'Name', 'Email', 'Pets', 'Joined', 'Status', 'Actions'].map(h => (
                            <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {users.map(user => (
                          <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{user.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.pets}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.joined}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${user.getStatusBadgeClass()}`}>
                                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button className="text-[#099FAD] hover:text-[#088a96] text-sm font-medium cursor-pointer">View Details</button>
                            </td>
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
                        <tr>
                          {['ID', 'Pet Name', 'Owner', 'Record Type', 'Date', 'Blockchain Hash', 'Actions'].map(h => (
                            <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {medicalRecords.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{record.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{record.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.recordType}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.date}</td>
                            <td className="px-6 py-4">
                              {record.isOnChain()
                                ? <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">{record.blockchainHash.slice(0, 20)}...</code>
                                : <span className="text-xs text-gray-400 italic">Not stored yet</span>
                              }
                            </td>
                            <td className="px-6 py-4 flex gap-2">
                              {/* Store on Chain button */}
                              {!record.isOnChain() && (
                                <button onClick={() => handleStoreOnChain(record)}
                                  className="px-3 py-1 bg-[#099FAD] text-white rounded-lg text-xs hover:bg-[#088a96] flex items-center gap-1 transition-colors cursor-pointer">
                                  <Shield className="w-3 h-3" /> Store on Chain
                                </button>
                              )}
                              {/* Verify button */}
                              {record.isOnChain() && (
                                <button onClick={() => handleVerifyRecord(record)}
                                  className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 flex items-center gap-1 transition-colors cursor-pointer">
                                  <CheckCircle className="w-3 h-3" /> Verify
                                </button>
                              )}
                            </td>
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

                {/* Network Status Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">Network Status</h2>
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                      blockchainData.isConnected() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      <span className={`w-2 h-2 rounded-full animate-pulse ${blockchainData.isConnected() ? 'bg-green-600' : 'bg-red-500'}`} />
                      {blockchainData.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { label: 'Network',          value: blockchainData.network },
                      { label: 'Contract Address', value: blockchainData.contractAddress, mono: true },
                      { label: 'Total Records',    value: blockchainData.totalRecords },
                      { label: 'Last Block Height',value: blockchainData.lastBlockHeight || '—' },
                      { label: 'Gas Price',         value: blockchainData.gasPrice },
                    ].map(({ label, value, mono }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 mb-1">{label}</p>
                        {mono
                          ? <code className="text-xs font-mono text-gray-900 break-all">{value}</code>
                          : <p className="text-sm font-semibold text-gray-900">{value}</p>
                        }
                      </div>
                    ))}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Network Health</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-500 h-2 rounded-full" style={{ width: '95%' }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700">95%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Blockchain Transactions */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Recent Blockchain Transactions</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Transaction Hash', 'Type', 'Pet', 'Timestamp', 'Status'].map(h => (
                            <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {medicalRecords.filter(r => r.isOnChain()).map(record => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">
                                {record.blockchainHash.slice(0, 20)}...
                              </code>
                            </td>
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
                        {medicalRecords.filter(r => r.isOnChain()).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">
                              No records stored on blockchain yet. Go to Medical Records to store them.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Smart Contract Info */}
                <div className="bg-gradient-to-br from-[#099FAD]/5 to-[#099FAD]/10 rounded-xl border border-[#099FAD]/20 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#099FAD]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield className="w-6 h-6 text-[#099FAD]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart Contract Security</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        All medical records are securely stored on the blockchain with cryptographic hashing.
                        Each record is immutable and traceable, ensuring data integrity and transparency.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowContractModal(true)}
                          className="px-4 py-2 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] transition-colors cursor-pointer">
                          View Contract
                        </button>
                        <button
                          onClick={async () => {
                            let allValid = true;
                            for (const record of medicalRecords.filter(r => r.isOnChain())) {
                              const result = await blockchainService.verifyRecord(record.id, record.toHashPayload());
                              if (!result.success || !result.isValid) { allValid = false; break; }
                            }
                            const onChainCount = medicalRecords.filter(r => r.isOnChain()).length;
                            if (onChainCount === 0) alert('⚠️ No records have been stored on blockchain yet.');
                            else alert(allValid ? `✅ All ${onChainCount} on-chain records verified successfully!` : '❌ Some records failed verification — possible tampering detected!');
                          }}
                          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                          Verify Records
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
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
                        { label: 'Email Notifications',     desc: 'Receive email alerts for new appointments',         defaultOn: true  },
                        { label: 'Auto-Confirm Appointments',desc: 'Automatically confirm appointments when booked',    defaultOn: false },
                        { label: 'Blockchain Verification',  desc: 'Require blockchain verification for all records',   defaultOn: true  },
                      ].map(({ label, desc, defaultOn }) => (
                        <div key={label} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{label}</p>
                            <p className="text-xs text-gray-500">{desc}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked={defaultOn} />
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
                        { label: 'Clinic Name',    type: 'text',  defaultValue: 'VetConnect Clinic'    },
                        { label: 'Contact Email',  type: 'email', defaultValue: 'contact@vetconnect.com'},
                        { label: 'Phone Number',   type: 'tel',   defaultValue: '+63 912 345 6789'     },
                      ].map(({ label, type, defaultValue }) => (
                        <div key={label}>
                          <label className="text-sm font-medium text-gray-700 block mb-2">{label}</label>
                          <input type={type} defaultValue={defaultValue}
                            className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    <button className="px-6 py-2.5 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] transition-colors cursor-pointer">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ── APPOINTMENT MODAL ── */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl animate-scaleIn">
            <button onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-all cursor-pointer">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-5">Manage Appointment</h3>

            <div className="space-y-4 mb-6">
              {[
                { label: 'Pet Name',     value: selectedItem.petName },
                { label: 'Owner',        value: selectedItem.owner   },
                { label: 'Service',      value: selectedItem.service },
                { label: 'Date & Time',  value: `${selectedItem.date} ${selectedItem.time}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-base font-semibold text-gray-900">{value}</p>
                </div>
              ))}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Current Status</p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${selectedItem.getStatusBadgeClass()}`}>
                  {getStatusIcon(selectedItem.status)}
                  {selectedItem.status.charAt(0).toUpperCase() + selectedItem.status.slice(1)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">Update Status:</p>
              {[
                { status: 'confirmed', label: 'Confirm Appointment', cls: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
                { status: 'completed', label: 'Mark as Completed',   cls: 'bg-blue-50  text-blue-700  border-blue-200  hover:bg-blue-100'  },
                { status: 'cancelled', label: 'Cancel Appointment',  cls: 'bg-red-50   text-red-700   border-red-200   hover:bg-red-100'   },
              ].map(({ status, label, cls }) => (
                <button key={status} onClick={() => handleStatusChange(selectedItem.id, status)}
                  className={`w-full px-4 py-2.5 border rounded-lg transition-colors text-sm font-medium cursor-pointer ${cls}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CONTRACT INFO MODAL ── */}
      {showContractModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 relative shadow-2xl animate-scaleIn">
            <button onClick={() => setShowContractModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-all cursor-pointer">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#099FAD]/20 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#099FAD]" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Smart Contract Details</h3>
                <p className="text-xs text-gray-500">VetConnectRecords — Deployed on Ganache</p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Contract Name',    value: 'VetConnectRecords' },
                { label: 'Network',          value: blockchainData.network },
                { label: 'Chain ID',         value: '1337 (Ganache Local)' },
                { label: 'Contract Address', value: blockchainData.contractAddress, mono: true },
                { label: 'Total Records',    value: `${blockchainData.totalRecords} record(s) stored` },
                { label: 'Owner',            value: 'Account[0] — Admin Wallet (Ganache)' },
                { label: 'Access Control',   value: 'onlyOwner — only admin can store records' },
                { label: 'Status',           value: blockchainData.status },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-start bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-500 w-36 flex-shrink-0">{label}</p>
                  {mono
                    ? <code className="text-xs font-mono text-gray-800 break-all text-right">{value}</code>
                    : <p className="text-sm font-medium text-gray-800 text-right">{value}</p>
                  }
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-[#099FAD]/5 border border-[#099FAD]/20 rounded-lg">
              <p className="text-xs text-gray-600">
                💡 To view this contract in Remix IDE, go to <strong>Deploy & Run Transactions</strong> → 
                paste the contract address in <strong>"At Address"</strong> field and click it.
              </p>
            </div>

            <button onClick={() => setShowContractModal(false)}
              className="mt-4 w-full px-4 py-2.5 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] transition-colors cursor-pointer">
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;