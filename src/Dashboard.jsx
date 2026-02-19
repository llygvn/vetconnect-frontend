import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Menu, SquarePen, Calendar, MessageCircleQuestion,
  Send, LogOut, ArrowDown, Camera, X
} from 'lucide-react';
import logoImg from './assets/logo.png';
import API from './api';

// ─── Cursor styles ─────────────────────────────────────────────────────────────
const cursorStyles = `
  button, [role="button"], label[for], label:has(input) { cursor: pointer }
  button:disabled { cursor: not-allowed }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

// ─── Avatar ────────────────────────────────────────────────────────────────────
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

// ─── Status badge ──────────────────────────────────────────────────────────────
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

// ─── AI Backend Config ─────────────────────────────────────────────────────────
const AI_BACKEND_URL = 'http://localhost:8001/chat';
const AI_RESET_URL   = 'http://localhost:8001/session/reset';

// ─── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = ({ onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Chat
  const [messages,      setMessages]      = useState([]);
  const [inputText,     setInputText]     = useState('');
  const [isTyping,      setIsTyping]      = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [chatHistory,   setChatHistory]   = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [currentView,   setCurrentView]   = useState('chat');

  // Date picker (shown when AI asks for datetime)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickedDate,     setPickedDate]     = useState('');
  const [pickedTime,     setPickedTime]     = useState('');

  // Appointments — start empty, populated by real AI bookings
  const [appointments,         setAppointments]         = useState([]);
  const [appointmentFilter,    setAppointmentFilter]    = useState('upcoming');
  const [serviceFilter,        setServiceFilter]        = useState('all');
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedAppointment,  setSelectedAppointment]  = useState(null);
  const [showRescheduler,      setShowRescheduler]      = useState(false);
  const [rescheduleDate,       setRescheduleDate]       = useState('');
  const [rescheduleTime,       setRescheduleTime]       = useState('');

  // Notifications
  const [notifications,     setNotifications]     = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Profile
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showEditModal,    setShowEditModal]    = useState(false);
  const [popupPos,         setPopupPos]         = useState({ bottom: 0, left: 0 });
  const [profileData, setProfileData] = useState({
    displayName: 'Alice Gong',
    username:    '@alice.gong',
    avatarUrl:   null,
  });
  const [editForm,    setEditForm]    = useState({ displayName: 'Alice Gong', username: '@alice.gong', avatarUrl: null });
  const [avatarError, setAvatarError] = useState('');

  // Refs
  const messagesEndRef   = useRef(null);
  const mainContainerRef = useRef(null);
  const profileBtnRef    = useRef(null);
  const profilePopupRef  = useRef(null);
  const notifRef         = useRef(null);

  // AI session
  const sessionIdRef = useRef(
    sessionStorage.getItem('vetbrain_session_id') || (() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem('vetbrain_session_id', id);
      return id;
    })()
  );

  // ── Cursor styles injection ───────────────────────────────────────────────────
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = cursorStyles;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  // ── Auto scroll ───────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (messages.length === 0) setShowDatePicker(false);
  }, [messages]);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 300);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ── Click-outside handlers ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (
        profilePopupRef.current && !profilePopupRef.current.contains(e.target) &&
        profileBtnRef.current   && !profileBtnRef.current.contains(e.target)
      ) setShowProfilePopup(false);

      if (notifRef.current && !notifRef.current.contains(e.target))
        setShowNotifications(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── AI Helpers ────────────────────────────────────────────────────────────────
  const callVetBrain = useCallback(async (userMessage) => {
    const res = await fetch(AI_BACKEND_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: userMessage, session_id: sessionIdRef.current }),
    });
    if (!res.ok) throw new Error(`AI backend returned ${res.status}`);
    const data = await res.json();
    if (data.session_id) {
      sessionIdRef.current = data.session_id;
      sessionStorage.setItem('vetbrain_session_id', data.session_id);
    }
    return { reply: data.reply, bookingData: data.booking_data || null };
  }, []);

  const resetSession = useCallback(async () => {
    try {
      const res  = await fetch(AI_RESET_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sessionIdRef.current }),
      });
      const data = await res.json();
      if (data.session_id) {
        sessionIdRef.current = data.session_id;
        sessionStorage.setItem('vetbrain_session_id', data.session_id);
      }
    } catch {
      const newId = crypto.randomUUID();
      sessionIdRef.current = newId;
      sessionStorage.setItem('vetbrain_session_id', newId);
    }
  }, []);

  const formatBotMessage = (text) =>
    text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');

  // ── Chat ──────────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (e, overrideText) => {
    if (e) e.preventDefault();
    const userText = overrideText !== undefined ? overrideText : inputText;
    if (!userText.trim()) return;

    setMessages(prev => [...prev, { text: userText, sender: 'user' }]);
    setInputText('');
    setShowDatePicker(false);
    setIsTyping(true);

    try {
      const { reply: botReply, bookingData } = await callVetBrain(userText);
      const cleaned = formatBotMessage(botReply);
      setMessages(prev => [...prev, { text: cleaned, sender: 'bot' }]);

      // Show date picker when AI is asking for datetime
      if (cleaned.toLowerCase().includes('mm/dd/yyyy') && cleaned.toLowerCase().includes('schedule')) {
        setPickedDate('');
        setPickedTime('');
        setShowDatePicker(true);
      } else {
        setShowDatePicker(false);
      }

      // If booking confirmed by AI, create appointment + notification
      if (bookingData) {
        const [datePart, ...timeParts] = bookingData.datetime.split(' ');
        const newAppointment = {
          id:                Date.now(),
          petName:           bookingData.petName,
          species:           bookingData.species,
          service:           bookingData.service,
          date:              datePart,
          time:              timeParts.join(' '),
          status:            'upcoming',
          appointmentStatus: 'pending',
          assignedVet:       'Pending assignment',
        };
        setAppointments(prev => [newAppointment, ...prev]);
        setNotifications(prev => [{
          id:      Date.now(),
          message: `Appointment for ${bookingData.petName} has been submitted and is pending confirmation.`,
          time:    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read:    false,
        }, ...prev]);
      }
    } catch (err) {
      console.error('VetBrain API error:', err);
      setMessages(prev => [...prev, {
        text:   "Sorry, I'm having trouble connecting to the AI service. Please try again in a moment.",
        sender: 'bot',
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [inputText, callVetBrain]);

  const handleNewChat = useCallback(async () => {
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
    await resetSession();
    setMessages([]);
    setShowDatePicker(false);
    setCurrentChatId(null);
    setCurrentView('chat');
  }, [messages, resetSession]);

  const loadChatHistory = useCallback(async (id) => {
    if (currentChatId !== id && messages.length > 0) {
      const firstMsg = messages.find(m => m.sender === 'user')?.text ?? 'New conversation';
      const updated  = {
        id:        currentChatId || Date.now(),
        title:     generateChatTitle(firstMsg),
        timestamp: 'Just now',
        preview:   firstMsg.slice(0, 50) + '…',
        messages:  [...messages],
      };
      setChatHistory(prev => {
        const exists = prev.find(c => c.id === updated.id);
        return exists
          ? prev.map(c => c.id === updated.id ? updated : c)
          : [updated, ...prev];
      });
    }
    const chat = chatHistory.find(c => c.id === id);
    if (chat) {
      await resetSession();
      setMessages(chat.messages ?? []);
      setShowDatePicker(false);
      setCurrentChatId(id);
      setCurrentView('chat');
    }
  }, [chatHistory, currentChatId, messages, resetSession]);

  // Smart suggestion buttons reset session before sending
  const handleSmartButton = useCallback(async (text) => {
    await resetSession();
    setMessages([]);
    setShowDatePicker(false);
    setCurrentChatId(null);
    await handleSend(null, text);
  }, [resetSession, handleSend]);

  // ── Appointments ──────────────────────────────────────────────────────────────
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
      a.id === selectedAppointment.id
        ? { ...a, status: 'cancelled', appointmentStatus: 'cancelled' }
        : a
    ));
    closeAppointmentModal();
    alert('Appointment cancelled successfully');
  }, [selectedAppointment, closeAppointmentModal]);

  const handleReschedule = useCallback(() => {
    if (!selectedAppointment || !rescheduleDate || !rescheduleTime) return;
    setAppointments(prev => prev.map(a =>
      a.id === selectedAppointment.id
        ? { ...a, date: rescheduleDate, time: rescheduleTime }
        : a
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

  // ── Profile ───────────────────────────────────────────────────────────────────
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

  // ── SECURE LOGOUT — blacklists token server-side ──────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────────
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

          {/* ── Header ── */}
          <header className="h-16 flex items-center justify-between px-6">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="VetConnect" className="w-8 h-8 object-contain" />
              <span className="text-xl font-semibold text-[#099FAD]">VetConnect</span>
            </div>

            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  setShowNotifications(v => !v);
                  setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                }}
                className="relative p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-scaleIn">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900">Notifications</p>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-gray-400">No notifications yet</p>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto">
                      {notifications.map(n => (
                        <div key={n.id} className="px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                          <p className="text-sm text-gray-800">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-1">{n.time}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

                {(() => {
                  const filtered = getFilteredAppointments();
                  return filtered.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-gray-500 mb-2">
                        {serviceFilter !== 'all'
                          ? `No ${appointmentFilter} appointments found for this service.`
                          : `You don't have any ${appointmentFilter} appointments yet.`}
                      </p>
                      {appointmentFilter === 'upcoming' && (
                        <button
                          onClick={() => setCurrentView('chat')}
                          className="mt-4 bg-[#099FAD] text-white text-sm font-medium px-6 py-2 rounded-full hover:bg-[#088a96] transition-colors"
                        >
                          Book via Chat
                        </button>
                      )}
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
                    { q: 'How do I book an appointment?',    a: "Chat with our AI assistant and mention you'd like to book. It'll guide you step by step!" },
                    { q: 'What are your clinic hours?',      a: 'Monday – Saturday: 7:00 AM – 8:00 PM. Sunday: Closed.' },
                    { q: 'Can I cancel or reschedule?',      a: 'Yes — go to My Appointments in the sidebar and select the appointment to modify.' },
                    { q: 'What animals do you treat?',       a: 'Dogs, Cats, Rabbits, Hamsters, Turtles, Birds, and farm animals (Cows, Pigs, Goats, Horses, etc.).' },
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
                <p className="text-sm text-gray-600 mb-2">Hi {profileData.displayName.split(' ')[0]}</p>
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
                  {['Book an appointment', 'Check clinic hours', 'Available services'].map(text => (
                    <button
                      key={text}
                      onClick={() => handleSmartButton(text)}
                      className="bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm py-2 px-4 rounded-full transition-all"
                    >
                      {text}
                    </button>
                  ))}
                  <button
                    onClick={() => setInputText('My pet is ')}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm py-2 px-4 rounded-full transition-all"
                  >
                    Check symptom
                  </button>
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
                        {msg.text.split('\n').map((line, j) => (
                          <span key={j}>{line}{j < msg.text.split('\n').length - 1 && <br />}</span>
                        ))}
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

                  {/* Date/time picker — appears when AI asks for datetime */}
                  {showDatePicker && (
                    <div className="mb-3 p-4 bg-gray-50 border border-[#088a96]/20 rounded-2xl animate-scaleIn">
                      <p className="text-xs font-medium text-gray-500 mb-3">Select appointment date &amp; time</p>
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">Date</label>
                          <input
                            type="date"
                            value={pickedDate}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={e => setPickedDate(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-[#099FAD] bg-white"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-400">Time</label>
                          <input
                            type="time"
                            value={pickedTime}
                            onChange={e => setPickedTime(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-[#099FAD] bg-white"
                          />
                        </div>
                        <button
                          disabled={!pickedDate || !pickedTime}
                          onClick={() => {
                            if (!pickedDate || !pickedTime) return;
                            const [y, m, d] = pickedDate.split('-');
                            const [hRaw, min] = pickedTime.split(':');
                            let h = parseInt(hRaw);
                            const period = h >= 12 ? 'PM' : 'AM';
                            if (h > 12) h -= 12;
                            if (h === 0) h = 12;
                            const formatted = `${m}/${d}/${y} ${h}:${min} ${period}`;
                            setShowDatePicker(false);
                            handleSend(null, formatted);
                          }}
                          className="px-4 py-2 bg-[#099FAD] text-white text-sm font-medium rounded-lg hover:bg-[#088a96] disabled:opacity-40 transition-all"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setShowDatePicker(false)}
                          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          Type manually
                        </button>
                      </div>
                    </div>
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
                { label: 'Species',     value: selectedAppointment.species },
                { label: 'Service',     value: selectedAppointment.service },
                { label: 'Date & Time', value: `${selectedAppointment.date} ${selectedAppointment.time}` },
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
                <h4 className="font-semibold text-gray-900">Select New Date &amp; Time</h4>
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
                <button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime} className="w-full bg-[#099FAD] text-white text-sm font-semibold px-4 py-3 rounded-lg hover:bg-[#088a96] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  Confirm Reschedule
                </button>
              </div>
            )}
            {!showRescheduler && (
              <div className="flex gap-3">
                {selectedAppointment.status === 'upcoming' && (
                  <button onClick={handleCancelAppointment} className="flex-1 bg-[#BC1610] text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-[#AF1510] transition-all">
                    Cancel Appointment
                  </button>
                )}
                {selectedAppointment.appointmentStatus === 'pending' && selectedAppointment.status === 'upcoming' && (
                  <button onClick={() => setShowRescheduler(true)} className="flex-1 bg-[#F0F4F8] text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-[#E6EAEE] transition-all">
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