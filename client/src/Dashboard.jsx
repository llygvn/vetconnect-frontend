import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Menu, SquarePen, Calendar, MessageCircleQuestion,
  Send, LogOut, ArrowDown, Camera, X
} from 'lucide-react';
import logoImg from './assets/logo.png';
import API from './api';

// FIX: Animation styles moved out of JS and into tailwind.config.js.
// Add this to your tailwind.config.js under theme.extend:
//
//   keyframes: {
//     fadeIn:  { from: { opacity: '0' },              to: { opacity: '1' } },
//     scaleIn: { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
//   },
//   animation: {
//     fadeIn:  'fadeIn 0.2s ease-out',
//     scaleIn: 'scaleIn 0.2s ease-out',
//   },
//
// Then use className="animate-fadeIn" and "animate-scaleIn" as before.
// The useEffect that injected <style> tags has been removed.

const cursorStyles = `
  button, [role="button"], label[for], label:has(input) { cursor: pointer }
  button:disabled { cursor: not-allowed }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (name = '') =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const generateChatTitle = (text = '') => {
  const t = text.toLowerCase();
  if (t.includes('book') || t.includes('appointment')) return 'Book appointment';
  if (t.includes('cancel'))     return 'Cancel appointment';
  if (t.includes('reschedule')) return 'Reschedule appointment';
  if (t.includes('vaccine') || t.includes('vaccination')) return 'Vaccine inquiry';
  if (t.includes('hour') || t.includes('time')) return 'Check clinic hours';
  if (t.includes('price') || t.includes('cost')) return 'Service pricing';
  return text.slice(0, 30) + (text.length > 30 ? '…' : '');
};

const generateResponse = (msg = '') => {
  const t = msg.toLowerCase();
  if (t.includes('appointment') || t.includes('book'))
    return "I can help you book an appointment. Would you like to see available slots for Dr. Smith tomorrow?";
  if (t.includes('hour') || t.includes('time'))
    return "Our clinic is open Monday to Saturday from 8:00 AM to 6:00 PM.";
  return "I'm here to help with your pet's needs. You can ask about appointments, clinic hours, or services.";
};

// ─── Initial data ─────────────────────────────────────────────────────────────
const INITIAL_APPOINTMENTS = [
  {
    id: 1, petName: 'Pumbaa', species: 'Warthog', service: 'Vaccination',
    date: 'February 12, 2026', time: '10:00 AM',
    status: 'upcoming', appointmentStatus: 'confirmed', assignedVet: 'Dr. Bert Cruz',
  },
  {
    id: 2, petName: 'Coco', species: 'Golden Retriever', service: 'Check-up',
    date: 'January 20, 2026', time: '02:00 PM',
    status: 'past', appointmentStatus: 'completed', assignedVet: 'Dr. Sarah Johnson',
  },
  {
    id: 3, petName: 'Meng', species: 'Aspin', service: 'Check-up',
    date: 'March 10, 2026', time: '3:00 PM',
    status: 'upcoming', appointmentStatus: 'pending', assignedVet: 'Dr. Maria Santos',
  },
];

const INITIAL_CHAT_HISTORY = [
  { id: 1, title: 'Book checkup for Max',      timestamp: '2 hours ago', preview: 'I need to schedule a checkup…' },
  { id: 2, title: 'Vaccine schedule inquiry',  timestamp: 'Yesterday',   preview: 'When should my puppy get…'  },
  { id: 3, title: 'Cancel Friday appointment', timestamp: '2 days ago',  preview: 'I need to cancel my…'       },
];

const SUGGESTIONS = ['Book an appointment', 'Check clinic hours', 'Available services', 'Vet availability'];

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar = ({ data, size = 'sm' }) => {
  const dims = size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-8 h-8 text-xs';
  return (
    <div className={`${dims} rounded-full bg-[#099FAD] flex items-center justify-center text-white font-semibold flex-shrink-0 overflow-hidden`}>
      {data.avatarUrl
        ? <img src={data.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
        : getInitials(data.displayName)}
    </div>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const styles = {
    confirmed: 'bg-green-100 text-green-700',
    pending:   'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  const dots = {
    confirmed: 'bg-green-600',
    pending:   'bg-yellow-600',
    completed: 'bg-blue-600',
    cancelled: 'bg-red-600',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-700'}`}>
      <span className={`w-2 h-2 rounded-full ${dots[status] ?? 'bg-gray-600'}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages,      setMessages]      = useState([]);
  const [inputText,     setInputText]     = useState('');
  const [isTyping,      setIsTyping]      = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [chatHistory,   setChatHistory]   = useState(INITIAL_CHAT_HISTORY);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [currentView,   setCurrentView]   = useState('chat');

  const [appointments,         setAppointments]         = useState(INITIAL_APPOINTMENTS);
  const [appointmentFilter,    setAppointmentFilter]    = useState('upcoming');
  const [serviceFilter,        setServiceFilter]        = useState('all');
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedAppointment,  setSelectedAppointment]  = useState(null);
  const [showRescheduler,      setShowRescheduler]      = useState(false);
  const [rescheduleDate,       setRescheduleDate]       = useState('');
  const [rescheduleTime,       setRescheduleTime]       = useState('');

  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showEditModal,    setShowEditModal]    = useState(false);
  const [popupPos,         setPopupPos]         = useState({ bottom: 0, left: 0 });
  const [profileData, setProfileData] = useState({
    displayName: 'Alice Gong',
    username:    '@alice.gong',
    avatarUrl:   null,
  });
  const [editForm,    setEditForm]    = useState({ ...profileData });
  const [avatarError, setAvatarError] = useState('');

  const messagesEndRef   = useRef(null);
  const mainContainerRef = useRef(null);
  const profileBtnRef    = useRef(null);
  const profilePopupRef  = useRef(null);

  // FIX: Inject only the cursor utility styles (animations moved to tailwind.config.js)
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = cursorStyles;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 300);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (
        profilePopupRef.current && !profilePopupRef.current.contains(e.target) &&
        profileBtnRef.current   && !profileBtnRef.current.contains(e.target)
      ) setShowProfilePopup(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const handleSend = useCallback((e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText;
    setMessages(prev => [...prev, { text, sender: 'user' }]);
    setInputText('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { text: generateResponse(text), sender: 'bot' }]);
      setIsTyping(false);
    }, 1500);
  }, [inputText]);

  const handleNewChat = useCallback(() => {
    if (messages.length > 0) {
      const firstMsg = messages.find(m => m.sender === 'user')?.text ?? 'New conversation';
      setChatHistory(prev => [{
        id:        Date.now(),
        title:     generateChatTitle(firstMsg),
        timestamp: 'Just now',
        preview:   firstMsg.slice(0, 50) + '…',
        messages:  [...messages],
      }, ...prev]);
    }
    setMessages([]);
    setCurrentChatId(null);
    setCurrentView('chat');
  }, [messages]);

  const loadChatHistory = useCallback((id) => {
    const chat = INITIAL_CHAT_HISTORY.find(c => c.id === id) ??
                 chatHistory.find(c => c.id === id);
    if (chat) {
      setMessages(chat.messages ?? []);
      setCurrentChatId(id);
      setCurrentView('chat');
    }
  }, [chatHistory]);

  // ── Appointments ─────────────────────────────────────────────────────────────
  const openAppointmentModal  = useCallback((apt) => { setSelectedAppointment(apt); setShowAppointmentModal(true); }, []);
  const closeAppointmentModal = useCallback(() => {
    setShowAppointmentModal(false);
    setSelectedAppointment(null);
    setShowRescheduler(false);
    setRescheduleDate('');
    setRescheduleTime('');
  }, []);

  const handleCancelAppointment = useCallback(() => {
    if (!selectedAppointment) return;
    setAppointments(prev => prev.map(a =>
      a.id === selectedAppointment.id ? { ...a, status: 'cancelled', appointmentStatus: 'cancelled' } : a
    ));
    closeAppointmentModal();
    alert('Appointment cancelled successfully');
  }, [selectedAppointment, closeAppointmentModal]);

  const handleReschedule = useCallback(() => {
    if (!selectedAppointment || !rescheduleDate || !rescheduleTime) return;
    setAppointments(prev => prev.map(a =>
      a.id === selectedAppointment.id ? { ...a, date: rescheduleDate, time: rescheduleTime } : a
    ));
    closeAppointmentModal();
    alert('Appointment rescheduled successfully');
  }, [selectedAppointment, rescheduleDate, rescheduleTime, closeAppointmentModal]);

  const getFilteredAppointments = useCallback(() => {
    let list = appointments.filter(a => a.status === appointmentFilter);
    if (serviceFilter !== 'all')
      list = list.filter(a => a.service.toLowerCase().includes(serviceFilter.toLowerCase()));
    return list;
  }, [appointments, appointmentFilter, serviceFilter]);

  // ── Profile ──────────────────────────────────────────────────────────────────
  const toggleProfilePopup = useCallback(() => {
    if (!showProfilePopup && profileBtnRef.current) {
      const rect = profileBtnRef.current.getBoundingClientRect();
      setPopupPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
    }
    setShowProfilePopup(p => !p);
  }, [showProfilePopup]);

  const handleAvatarChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarError('');
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setAvatarError('Only JPG or PNG files are allowed.'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5MB.'); return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setEditForm(prev => ({ ...prev, avatarUrl: ev.target.result }));
    reader.readAsDataURL(file);
  }, []);

  const handleSaveProfile  = useCallback(() => { setProfileData({ ...editForm }); setShowEditModal(false); }, [editForm]);
  const handleCancelEdit   = useCallback(() => { setEditForm({ ...profileData }); setAvatarError(''); setShowEditModal(false); }, [profileData]);

  // FIX: Replaced hardcoded 'http://localhost:5000/api/logout' with the shared API instance.
  // The old URL silently failed on any deployed environment, meaning tokens were never
  // blacklisted and stayed valid after the user clicked "Log out".
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-white flex flex-col transition-all duration-300 ease-in-out relative z-30 shadow-lg`}>
        <div className="h-16 flex items-center px-4">
          <button
            onClick={() => setIsSidebarOpen(o => !o)}
            className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-700"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-6 overflow-hidden">
          <div className="space-y-2 px-2">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-3 p-3 text-gray-600 hover:bg-gray-50 rounded-lg transition-all"
              title="New Chat"
            >
              <SquarePen className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'}`}>
                New Chat
              </span>
            </button>

            <div className={`space-y-2 transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
              <button
                onClick={() => setCurrentView('appointments')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${currentView === 'appointments' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Calendar className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">My Appointments</span>
              </button>
              <button
                onClick={() => setCurrentView('help')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${currentView === 'help' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <MessageCircleQuestion className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">Help/FAQs</span>
              </button>
            </div>

            <div className={`transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="h-px bg-gray-200 my-3 mx-2" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2 pb-2 px-3">Recent</p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {chatHistory.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => loadChatHistory(chat.id)}
                    className={`w-full flex flex-col items-start p-3 rounded-lg transition-all hover:bg-gray-50 ${currentChatId === chat.id ? 'bg-gray-100' : ''}`}
                  >
                    <span className="text-sm font-medium text-gray-700 truncate w-full text-left">{chat.title}</span>
                    <span className="text-xs text-gray-400 mt-0.5">{chat.timestamp}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>

        <div className="p-3">
          <button
            ref={profileBtnRef}
            onClick={toggleProfilePopup}
            className={`w-full flex items-center p-2 rounded-lg hover:bg-gray-50 transition-all ${!isSidebarOpen ? 'justify-center' : ''}`}
            aria-label="Profile menu"
          >
            <Avatar data={profileData} />
            <div className={`min-w-0 transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'opacity-100 w-auto ml-3' : 'opacity-0 w-0 ml-0'}`}>
              <p className="text-sm font-medium text-gray-700 truncate">{profileData.displayName}</p>
              <p className="text-xs text-gray-400 truncate">{profileData.username}</p>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Profile popup ── */}
      {showProfilePopup && (
        <div
          ref={profilePopupRef}
          className="fixed z-[100] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-scaleIn"
          style={{ bottom: popupPos.bottom, left: popupPos.left, width: 220 }}
        >
          <button
            onClick={() => { setShowEditModal(true); setShowProfilePopup(false); setEditForm({ ...profileData }); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
          >
            <Avatar data={profileData} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{profileData.displayName}</p>
              <p className="text-xs text-gray-400 truncate">{profileData.username}</p>
            </div>
          </button>
          <div className="h-px bg-gray-100 mx-3" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">Log out</span>
          </button>
        </div>
      )}

      {/* ── Main content ── */}
      <main
        ref={mainContainerRef}
        onScroll={handleScroll}
        className="flex-1 h-screen overflow-y-auto bg-white relative scroll-smooth"
      >
        <div className="min-h-full flex flex-col">
          <header className="h-16 flex items-center px-6">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="VetConnect" className="w-8 h-8 object-contain" />
              <span className="text-xl font-semibold text-[#099FAD]">VetConnect</span>
            </div>
          </header>

          {/* ── Appointments view ── */}
          {currentView === 'appointments' && (
            <div className="flex-1 px-6 py-8 overflow-y-auto">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-8">
                  <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 bg-[#099FAD]/10 rounded-full flex items-center justify-center">
                      <Calendar className="w-8 h-8 text-[#099FAD]" />
                    </div>
                  </div>
                  <h1 className="text-3xl font-semibold text-[#099FAD] mb-2">My Appointments</h1>
                  <p className="text-sm text-gray-500">Keep track of your furbaby's health journey.</p>
                </div>

                <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
                  <div className="flex gap-2">
                    {['upcoming', 'past', 'cancelled'].map(f => (
                      <button
                        key={f}
                        onClick={() => setAppointmentFilter(f)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all border ${appointmentFilter === f ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30' : 'text-gray-600 hover:bg-gray-50 border-transparent'}`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </div>
                    <select
                      value={serviceFilter}
                      onChange={e => setServiceFilter(e.target.value)}
                      className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20 cursor-pointer shadow-sm hover:border-gray-300 transition-all"
                    >
                      <option value="all">All Services</option>
                      <option value="consultation">Consultation / Check-up</option>
                      <option value="vaccination">Vaccination</option>
                      <option value="grooming">Grooming</option>
                      <option value="spay">Spay &amp; Neuter (Kapon)</option>
                      <option value="deworming">Deworming</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* FIX: Call getFilteredAppointments() once and store in a variable.
                    Previously it was called twice (once for .length check, once for .map),
                    running the filter logic redundantly on each render. */}
                {(() => {
                  const filtered = getFilteredAppointments();
                  return filtered.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-gray-600">
                        {serviceFilter !== 'all'
                          ? `No ${appointmentFilter} appointments found for this service.`
                          : `You don't have any ${appointmentFilter} appointments yet.`}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filtered.map(apt => (
                        <div key={apt.id} className="bg-white border border-[#099FAD]/30 rounded-2xl p-6 flex flex-col items-center text-center hover:shadow-md transition-shadow">
                          <div className="w-16 h-16 bg-[#099FAD]/10 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-10 h-10 text-[#099FAD]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 6c-2.21 0-4-1.79-4-4h-1c0 2.76 2.24 5 5 5s5-2.24 5-5h-1c0 2.21-1.79 4-4 4z"/>
                            </svg>
                          </div>
                          <h3 className="text-xl font-semibold text-[#099FAD] mb-1">{apt.petName}</h3>
                          <p className="text-sm text-gray-600 mb-1">Species: {apt.species}</p>
                          <p className="text-sm text-gray-600 mb-3">{apt.service}</p>
                          <p className="text-xs text-gray-500 mb-4">{apt.date} {apt.time}</p>
                          <button
                            onClick={() => openAppointmentModal(apt)}
                            className="bg-[#099FAD] text-white text-sm font-medium px-6 py-2 rounded-full hover:bg-[#088a96] transition-colors"
                          >
                            View more
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Help view ── */}
          {currentView === 'help' && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
              <div className="text-center max-w-2xl w-full">
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 bg-[#099FAD]/10 rounded-full flex items-center justify-center">
                    <MessageCircleQuestion className="w-8 h-8 text-[#099FAD]" />
                  </div>
                </div>
                <h1 className="text-3xl font-semibold text-[#099FAD] mb-2">Help &amp; FAQs</h1>
                <p className="text-sm text-gray-500 mb-8">Find answers to common questions</p>
                <div className="text-left space-y-4">
                  {[
                    { q: 'How do I book an appointment?',    a: "Simply chat with our AI assistant and mention you'd like to book an appointment. We'll guide you through the process!" },
                    { q: 'What are your clinic hours?',      a: "We're open Monday to Saturday from 8:00 AM to 6:00 PM." },
                    { q: 'Can I cancel or reschedule?',      a: "Yes! Just let our assistant know and we'll help you reschedule or cancel your appointment." },
                  ].map(({ q, a }) => (
                    <div key={q} className="bg-white border border-gray-200 rounded-xl p-5">
                      <h3 className="font-semibold text-gray-900 mb-2">{q}</h3>
                      <p className="text-sm text-gray-600">{a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Chat: empty state ── */}
          {currentView === 'chat' && messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="w-full max-w-2xl text-center">
                <p className="text-sm text-gray-600 mb-2">Hi Alice</p>
                <h1 className="text-4xl font-normal text-gray-900 mb-12">Where should we start?</h1>
                <form onSubmit={handleSend} className="w-full relative mb-6">
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Enter a prompt…"
                    className="w-full bg-white border border-[#088a96]/30 text-gray-800 placeholder-gray-400 rounded-full py-3.5 pl-6 pr-14 focus:outline-none transition-all shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#099FAD] text-white rounded-full hover:bg-[#088a96] disabled:opacity-40 disabled:hover:bg-[#099FAD] transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map(text => (
                    <button
                      key={text}
                      onClick={() => setInputText(text)}
                      className="bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm py-2 px-4 rounded-full transition-all"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Chat: active ── */}
          {currentView === 'chat' && messages.length > 0 && (
            <>
              <div className="flex-1 px-4 max-w-4xl mx-auto w-full py-6">
                <div className="space-y-6">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-5 py-3.5 text-base leading-relaxed ${msg.sender === 'user' ? 'bg-[#099FAD] text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-5 py-3.5 flex gap-1.5">
                        {[0, 0.2, 0.4].map((delay, i) => (
                          <span key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="sticky bottom-0 w-full bg-white py-4 px-4">
                <div className="w-full max-w-3xl mx-auto relative">
                  {showScrollBtn && (
                    <button
                      onClick={scrollToBottom}
                      className="absolute -top-12 left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center bg-white rounded-full shadow-md text-gray-600 hover:text-[#099FAD] transition-all"
                      aria-label="Scroll to bottom"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  )}
                  <form onSubmit={handleSend} className="w-full relative">
                    <input
                      type="text"
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      placeholder="Enter a prompt…"
                      className="w-full bg-white border border-[#088a96]/30 text-gray-800 placeholder-gray-400 rounded-full py-3 pl-5 pr-12 focus:outline-none transition-all shadow-sm"
                    />
                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#099FAD] text-white rounded-full hover:bg-[#088a96] disabled:opacity-40 disabled:hover:bg-[#099FAD] transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                  <p className="text-xs text-gray-400 mt-2 text-center">VetConnect can make mistakes. Check important info.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Appointment modal ── */}
      {showAppointmentModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl animate-scaleIn">
            <button onClick={closeAppointmentModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-all" aria-label="Close">
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-5">Appointment Details</h3>
            <div className="space-y-4 mb-6">
              {[
                { label: 'Species',    value: selectedAppointment.species },
                { label: 'Service',    value: selectedAppointment.service },
                { label: 'Date & Time',value: `${selectedAppointment.date} ${selectedAppointment.time}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-base font-semibold text-gray-900">{value}</p>
                </div>
              ))}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Status:</p>
                <StatusBadge status={selectedAppointment.appointmentStatus} />
              </div>
              <div className="flex items-center justify-between bg-[#099FAD]/5 rounded-lg p-3 border border-[#099FAD]/20">
                <p className="text-xs text-gray-600">Assigned Vet:</p>
                <p className="text-sm font-semibold text-[#099FAD]">{selectedAppointment.assignedVet}</p>
              </div>
            </div>
            {showRescheduler && (
              <div className="mb-6 p-5 bg-gradient-to-br from-[#099FAD]/5 to-[#099FAD]/10 rounded-xl border border-[#099FAD]/20 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-[#099FAD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h4 className="font-semibold text-gray-900">Select New Date &amp; Time</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Date</label>
                    <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20 transition-all" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Time</label>
                    <input type="time" value={rescheduleTime} onChange={e => setRescheduleTime(e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20 transition-all" />
                  </div>
                </div>
                <button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime} className="w-full bg-[#099FAD] text-white text-sm font-semibold px-4 py-3 rounded-lg hover:bg-[#088a96] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md">
                  Confirm Reschedule
                </button>
              </div>
            )}
            {!showRescheduler && (
              <div className="flex gap-3">
                {selectedAppointment.status === 'upcoming' && (
                  <button onClick={handleCancelAppointment} className="flex-1 bg-[#BC1610] text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-[#AF1510] transition-all shadow-sm hover:shadow-md">
                    Cancel Appointment
                  </button>
                )}
                {selectedAppointment.appointmentStatus === 'pending' && selectedAppointment.status === 'upcoming' && (
                  <button onClick={() => setShowRescheduler(true)} className="flex-1 bg-[#F0F4F8] text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-[#E6EAEE] transition-all shadow-sm">
                    Reschedule
                  </button>
                )}
              </div>
            )}
            {selectedAppointment.status === 'past' && !showRescheduler && (
              <p className="text-sm text-gray-500 text-center mt-4">This appointment has been completed</p>
            )}
            {selectedAppointment.appointmentStatus !== 'pending' && selectedAppointment.status === 'upcoming' && !showRescheduler && (
              <p className="text-xs text-gray-500 text-center mt-4">Rescheduling is only available for pending appointments</p>
            )}
          </div>
        </div>
      )}

      {/* ── Edit profile modal ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Edit profile</h2>
              <button onClick={handleCancelEdit} className="p-1 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex justify-center mb-6">
              <div className="relative">
                <Avatar data={editForm} size="lg" />
                <label className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-gray-600" />
                  <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleAvatarChange} />
                </label>
              </div>
            </div>
            {avatarError && <p className="text-xs text-red-500 text-center -mt-3 mb-4">{avatarError}</p>}
            <div className="space-y-4 mb-6">
              {[
                { label: 'Display name', key: 'displayName' },
                { label: 'Username',     key: 'username'    },
              ].map(({ label, key }) => (
                <div key={key} className="border border-gray-200 rounded-xl px-4 py-3 focus-within:border-[#099FAD] transition-colors">
                  <label className="text-xs text-gray-400 block mb-1">{label}</label>
                  <input
                    type="text"
                    value={editForm[key]}
                    onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full text-sm text-gray-800 focus:outline-none bg-transparent"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mb-6">Only JPG or PNG files allowed. Max size: 5MB.</p>
            <div className="flex gap-3">
              <button onClick={handleCancelEdit} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-full hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSaveProfile} className="flex-1 bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-full hover:bg-gray-700 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;