import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, Home, Calendar, Users, FileText, Activity, 
  Settings, LogOut, User, Search, MoreVertical, 
  CheckCircle, Clock, XCircle, DollarSign, TrendingUp,
  Shield, Database
} from 'lucide-react';
import logoImg from './assets/logo.png';

// Add animation styles
const modalStyles = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes scaleIn {
    from { 
      opacity: 0;
      transform: scale(0.95);
    }
    to { 
      opacity: 1;
      transform: scale(1);
    }
  }
  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out;
  }
  .animate-scaleIn {
    animation: scaleIn 0.2s ease-out;
  }
`;

const AdminDashboard = ({ onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('overview'); // 'overview' | 'appointments' | 'users' | 'records' | 'blockchain' | 'settings'
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [appointmentFilter, setAppointmentFilter] = useState('all');

  // Mock Data
  const [stats] = useState({
    totalAppointments: 248,
    activeUsers: 156,
    completedToday: 12,
    revenue: 45600,
    pendingAppointments: 18,
    cancelledToday: 3
  });

  const [appointments, setAppointments] = useState([
    {
      id: 1,
      petName: "Max",
      owner: "John Smith",
      service: "Vaccination",
      date: "2026-02-15",
      time: "10:00 AM",
      status: "confirmed",
      vet: "Dr. Sarah Johnson"
    },
    {
      id: 2,
      petName: "Bella",
      owner: "Maria Santos",
      service: "Check-up",
      date: "2026-02-15",
      time: "11:30 AM",
      status: "pending",
      vet: "Dr. Bert Cruz"
    },
    {
      id: 3,
      petName: "Charlie",
      owner: "Robert Lee",
      service: "Grooming",
      date: "2026-02-15",
      time: "02:00 PM",
      status: "completed",
      vet: "Dr. Maria Santos"
    },
    {
      id: 4,
      petName: "Luna",
      owner: "Emma Wilson",
      service: "Deworming",
      date: "2026-02-15",
      time: "03:30 PM",
      status: "cancelled",
      vet: "Dr. Sarah Johnson"
    },
    {
      id: 5,
      petName: "Rocky",
      owner: "David Chen",
      service: "Spay & Neuter",
      date: "2026-02-16",
      time: "09:00 AM",
      status: "pending",
      vet: "Dr. Bert Cruz"
    }
  ]);

  const [users] = useState([
    { id: 1, name: "Alice Gong", email: "alice@email.com", pets: 2, joined: "2025-12-10", status: "active" },
    { id: 2, name: "John Smith", email: "john@email.com", pets: 1, joined: "2026-01-05", status: "active" },
    { id: 3, name: "Maria Santos", email: "maria@email.com", pets: 3, joined: "2025-11-20", status: "active" },
    { id: 4, name: "Robert Lee", email: "robert@email.com", pets: 1, joined: "2026-01-15", status: "inactive" },
    { id: 5, name: "Emma Wilson", email: "emma@email.com", pets: 2, joined: "2025-12-28", status: "active" }
  ]);

  const [medicalRecords] = useState([
    { id: 1, petName: "Max", owner: "John Smith", recordType: "Vaccination Record", date: "2026-02-10", blockchainHash: "0x7a8f...3c2d" },
    { id: 2, petName: "Bella", owner: "Maria Santos", recordType: "Medical History", date: "2026-02-12", blockchainHash: "0x9b4e...5f1a" },
    { id: 3, petName: "Charlie", owner: "Robert Lee", recordType: "Lab Results", date: "2026-02-14", blockchainHash: "0x3d2c...8a7b" },
    { id: 4, petName: "Luna", owner: "Emma Wilson", recordType: "Prescription", date: "2026-02-13", blockchainHash: "0x6f8e...2d4c" }
  ]);

  const [blockchainData] = useState({
    network: "Ethereum Sepolia Testnet",
    contractAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    totalRecords: 342,
    lastBlockHeight: 5847293,
    gasPrice: "12 Gwei",
    status: "Connected"
  });

  // Inject modal animation styles
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = modalStyles;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  const handleStatusChange = (appointmentId, newStatus) => {
    setAppointments(prev => prev.map(apt => 
      apt.id === appointmentId ? { ...apt, status: newStatus } : apt
    ));
    setShowModal(false);
    alert(`Appointment status updated to: ${newStatus}`);
  };

  const getFilteredAppointments = () => {
    if (appointmentFilter === 'all') return appointments;
    return appointments.filter(apt => apt.status === appointmentFilter);
  };

  const getStatusBadge = (status) => {
    const styles = {
      confirmed: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-blue-100 text-blue-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-16'
        } bg-white flex flex-col transition-all duration-300 ease-in-out relative z-30 shadow-lg border-r border-gray-200`}
      >
        {/* Hamburger Menu */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 overflow-hidden">
          <div className="space-y-2 px-2">
            <button 
              onClick={() => setCurrentView('overview')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                currentView === 'overview' ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Overview"
            >
              <Home className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
              }`}>
                Overview
              </span>
            </button>

            <button 
              onClick={() => setCurrentView('appointments')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                currentView === 'appointments' ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Appointments"
            >
              <Calendar className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
              }`}>
                Appointments
              </span>
            </button>

            <button 
              onClick={() => setCurrentView('users')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                currentView === 'users' ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Users"
            >
              <Users className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
              }`}>
                Users
              </span>
            </button>

            <button 
              onClick={() => setCurrentView('records')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                currentView === 'records' ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Medical Records"
            >
              <FileText className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
              }`}>
                Medical Records
              </span>
            </button>

            <button 
              onClick={() => setCurrentView('blockchain')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                currentView === 'blockchain' ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Blockchain"
            >
              <Database className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
              }`}>
                Blockchain
              </span>
            </button>

            <button 
              onClick={() => setCurrentView('settings')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                currentView === 'settings' ? 'bg-[#099FAD] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title="Settings"
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
              }`}>
                Settings
              </span>
            </button>
          </div>
        </nav>

        {/* Admin Profile at Bottom */}
        <div className="p-3 border-t border-gray-200">
          <div className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-all ${!isSidebarOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-[#099FAD] flex items-center justify-center text-white flex-shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-300 overflow-hidden ${
              isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'
            }`}>
              <p className="text-sm font-medium text-gray-700 truncate">Admin</p>
              <button 
                onClick={onLogout} 
                className="text-xs text-gray-500 hover:text-[#099FAD] transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 h-screen overflow-y-auto bg-gray-50">
        <div className="min-h-full">
          
          {/* Header */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-20">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="VetConnect" className="w-8 h-8 object-contain" />
              <span className="text-xl font-semibold text-[#099FAD]">VetConnect Admin</span>
            </div>
            
            {/* Search Bar */}
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
            </div>
          </header>

          {/* Content Area */}
          <div className="p-6">
            
            {/* OVERVIEW VIEW */}
            {currentView === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard Overview</h1>
                  <p className="text-sm text-gray-500">Welcome back, Administrator</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <Calendar className="w-5 h-5 text-[#099FAD]" />
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalAppointments}</p>
                    <p className="text-xs text-gray-500 mt-1">Total Appointments</p>
                  </div>

                  <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <Users className="w-5 h-5 text-[#099FAD]" />
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.activeUsers}</p>
                    <p className="text-xs text-gray-500 mt-1">Active Users</p>
                  </div>

                  <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.completedToday}</p>
                    <p className="text-xs text-gray-500 mt-1">Completed Today</p>
                  </div>

                  <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <DollarSign className="w-5 h-5 text-[#099FAD]" />
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">₱{stats.revenue.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Revenue (MTD)</p>
                  </div>

                  <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <Clock className="w-5 h-5 text-yellow-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.pendingAppointments}</p>
                    <p className="text-xs text-gray-500 mt-1">Pending</p>
                  </div>

                  <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <XCircle className="w-5 h-5 text-red-500" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.cancelledToday}</p>
                    <p className="text-xs text-gray-500 mt-1">Cancelled Today</p>
                  </div>
                </div>

                {/* Recent Appointments */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-5 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Recent Appointments</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Pet</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Owner</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date & Time</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {appointments.slice(0, 5).map((apt) => (
                          <tr key={apt.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{apt.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.service}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.date} {apt.time}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(apt.status)}`}>
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

            {/* APPOINTMENTS VIEW */}
            {currentView === 'appointments' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Appointments Management</h1>
                    <p className="text-sm text-gray-500">Manage and track all appointments</p>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 border-b border-gray-200 pb-4">
                  {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setAppointmentFilter(filter)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all border ${
                        appointmentFilter === filter
                          ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30'
                          : 'text-gray-600 hover:bg-gray-50 border-transparent'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Appointments Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Pet Name</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Owner</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Time</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Vet</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {getFilteredAppointments().map((apt) => (
                          <tr key={apt.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{apt.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{apt.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.service}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.date}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.time}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{apt.vet}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(apt.status)}`}>
                                {getStatusIcon(apt.status)}
                                {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => {
                                  setSelectedItem(apt);
                                  setShowModal(true);
                                }}
                                className="text-[#099FAD] hover:text-[#088a96] transition-colors"
                              >
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

            {/* USERS VIEW */}
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
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Pets</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Joined</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{user.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.pets}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.joined}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button className="text-[#099FAD] hover:text-[#088a96] text-sm font-medium">
                                View Details
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

            {/* MEDICAL RECORDS VIEW */}
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
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Pet Name</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Owner</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Record Type</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Blockchain Hash</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {medicalRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">#{record.id}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{record.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.owner}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.recordType}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.date}</td>
                            <td className="px-6 py-4">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">
                                {record.blockchainHash}
                              </code>
                            </td>
                            <td className="px-6 py-4">
                              <button className="text-[#099FAD] hover:text-[#088a96] text-sm font-medium">
                                View Record
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

            {/* BLOCKCHAIN VIEW */}
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
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                      {blockchainData.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Network</p>
                      <p className="text-sm font-semibold text-gray-900">{blockchainData.network}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Contract Address</p>
                      <code className="text-xs font-mono text-gray-900 break-all">{blockchainData.contractAddress}</code>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Total Records</p>
                      <p className="text-sm font-semibold text-gray-900">{blockchainData.totalRecords}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Last Block Height</p>
                      <p className="text-sm font-semibold text-gray-900">{blockchainData.lastBlockHeight.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Gas Price</p>
                      <p className="text-sm font-semibold text-gray-900">{blockchainData.gasPrice}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Network Health</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-500 h-2 rounded-full" style={{ width: '95%' }}></div>
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
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Transaction Hash</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Pet</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Timestamp</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {medicalRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">
                                {record.blockchainHash}
                              </code>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.recordType}</td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{record.petName}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.date}</td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                <CheckCircle className="w-3 h-3" />
                                Confirmed
                              </span>
                            </td>
                          </tr>
                        ))}
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
                        <button className="px-4 py-2 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] transition-colors">
                          View Contract
                        </button>
                        <button className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          Verify Records
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SETTINGS VIEW */}
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
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Email Notifications</p>
                          <p className="text-xs text-gray-500">Receive email alerts for new appointments</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#099FAD]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#099FAD]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Auto-Confirm Appointments</p>
                          <p className="text-xs text-gray-500">Automatically confirm appointments when booked</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#099FAD]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#099FAD]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Blockchain Verification</p>
                          <p className="text-xs text-gray-500">Require blockchain verification for all records</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#099FAD]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#099FAD]"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinic Information</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">Clinic Name</label>
                        <input 
                          type="text"
                          defaultValue="VetConnect Clinic"
                          className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">Contact Email</label>
                        <input 
                          type="email"
                          defaultValue="contact@vetconnect.com"
                          className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">Phone Number</label>
                        <input 
                          type="tel"
                          defaultValue="+63 912 345 6789"
                          className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button className="px-6 py-2.5 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] transition-colors">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Appointment Action Modal */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl animate-scaleIn">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-5">Manage Appointment</h3>

            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Pet Name</p>
                <p className="text-base font-semibold text-gray-900">{selectedItem.petName}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Owner</p>
                <p className="text-base font-semibold text-gray-900">{selectedItem.owner}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Service</p>
                <p className="text-base font-semibold text-gray-900">{selectedItem.service}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Date & Time</p>
                <p className="text-base font-semibold text-gray-900">{selectedItem.date} {selectedItem.time}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Current Status</p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedItem.status)}`}>
                  {getStatusIcon(selectedItem.status)}
                  {selectedItem.status.charAt(0).toUpperCase() + selectedItem.status.slice(1)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">Update Status:</p>
              <button 
                onClick={() => handleStatusChange(selectedItem.id, 'confirmed')}
                className="w-full px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
              >
                Confirm Appointment
              </button>
              <button 
                onClick={() => handleStatusChange(selectedItem.id, 'completed')}
                className="w-full px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
              >
                Mark as Completed
              </button>
              <button 
                onClick={() => handleStatusChange(selectedItem.id, 'cancelled')}
                className="w-full px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
              >
                Cancel Appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;