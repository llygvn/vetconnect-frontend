import React, 
{ useState, useRef, useEffect } from 'react';
import { 
  Menu, SquarePen, Calendar, MessageCircleQuestion, 
  User, Send, LogOut, ArrowDown 
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

const Dashboard = ({ onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to collapsed
  
  // Chat States
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  
  // Chat History States
  const [chatHistory, setChatHistory] = useState([
    { id: 1, title: "Book checkup for Max", timestamp: "2 hours ago", preview: "I need to schedule a checkup..." },
    { id: 2, title: "Vaccine schedule inquiry", timestamp: "Yesterday", preview: "When should my puppy get..." },
    { id: 3, title: "Cancel Friday appointment", timestamp: "2 days ago", preview: "I need to cancel my..." },
  ]);
  const [currentChatId, setCurrentChatId] = useState(null);
  
  // View States
  const [currentView, setCurrentView] = useState('chat'); // 'chat' | 'appointments' | 'help'
  const [appointments, setAppointments] = useState([
    
    {
      id: 1,
      petName: "Pumbaa",
      species: "Warthog",
      service: "Vaccination",
      date: "February 12, 2026",
      time: "10:00 AM",
      status: "upcoming",
      appointmentStatus: "confirmed",
      assignedVet: "Dr. Bert Cruz"
    },
    {
      id: 2,
      petName: "Coco",
      species: "Golden Retriever",
      service: "Check-up",
      date: "January 20, 2026",
      time: "02:00 PM",
      status: "past",
      appointmentStatus: "completed",
      assignedVet: "Dr. Sarah Johnson"
    },
    {
      id: 3,
      petName: "Meng",
      species: "Aspin",
      service: "Check-up",
      date: "March 10, 2026",
      time: "3:00 PM",
      status: "upcoming",
      appointmentStatus: "pending",
      assignedVet: "Dr. Maria Santos"
    }
  ]);
  const [appointmentFilter, setAppointmentFilter] = useState('upcoming'); // 'upcoming' | 'past' | 'cancelled'
  const [serviceFilter, setServiceFilter] = useState('all'); // 'all' | 'consultation' | 'vaccination' | etc.
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showRescheduler, setShowRescheduler] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  
  const messagesEndRef = useRef(null);
  const mainContainerRef = useRef(null);

  // Inject modal animation styles
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = modalStyles;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  // --- AUTO SCROLL ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isUp = scrollHeight - scrollTop - clientHeight > 300;
    setShowScrollBtn(isUp);
  };

  // --- FAKE AI LOGIC ---
  const generateResponse = (userMessage) => {
    const lowerMsg = userMessage.toLowerCase();
    if (lowerMsg.includes('appointment') || lowerMsg.includes('book')) {
      return "I can help you book an appointment. Would you like to see available slots for Dr. Smith tomorrow?";
    }
    if (lowerMsg.includes('hour') || lowerMsg.includes('time')) {
      return "Our clinic is open Monday to Saturday from 8:00 AM to 6:00 PM.";
    }
    return "I'm here to help with your pet's needs. You can ask about appointments, clinic hours, or services.";
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMessages = [...messages, { text: inputText, sender: 'user' }];
    setMessages(newMessages);
    setInputText("");
    setIsTyping(true);

    setTimeout(() => {
      const botReply = generateResponse(inputText);
      setMessages(prev => [...prev, { text: botReply, sender: 'bot' }]);
      setIsTyping(false);
    }, 1500);
  };

  const handleSuggestionClick = (text) => {
    setInputText(text);
  };

  // --- CHAT HISTORY FUNCTIONS ---
  const generateChatTitle = (firstMessage) => {
    const text = firstMessage.toLowerCase();
    if (text.includes('book') || text.includes('appointment')) return "Book appointment";
    if (text.includes('cancel')) return "Cancel appointment";
    if (text.includes('reschedule')) return "Reschedule appointment";
    if (text.includes('vaccine') || text.includes('vaccination')) return "Vaccine inquiry";
    if (text.includes('hour') || text.includes('time')) return "Check clinic hours";
    if (text.includes('price') || text.includes('cost')) return "Service pricing";
    return firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
  };

  const handleNewChat = () => {
    // Save current chat to history if it has messages
    if (messages.length > 0) {
      const firstUserMessage = messages.find(m => m.sender === 'user')?.text || "New conversation";
      const newChat = {
        id: Date.now(),
        title: generateChatTitle(firstUserMessage),
        timestamp: "Just now",
        preview: firstUserMessage.slice(0, 50) + '...',
        messages: [...messages]
      };
      setChatHistory(prev => [newChat, ...prev]);
    }
    
    // Start fresh chat
    setMessages([]);
    setCurrentChatId(null);
    setCurrentView('chat');
  };

  const loadChatHistory = (chatId) => {
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      setMessages(chat.messages || []);
      setCurrentChatId(chatId);
      setCurrentView('chat');
    }
  };

  // --- APPOINTMENT FUNCTIONS ---
  const openAppointmentModal = (appointment) => {
    setSelectedAppointment(appointment);
    setShowAppointmentModal(true);
  };

  const closeAppointmentModal = () => {
    setShowAppointmentModal(false);
    setSelectedAppointment(null);
    setShowRescheduler(false);
    setRescheduleDate('');
    setRescheduleTime('');
  };

  const handleCancelAppointment = () => {
    if (selectedAppointment) {
      setAppointments(prev => prev.map(apt => 
        apt.id === selectedAppointment.id 
          ? { ...apt, status: 'cancelled', appointmentStatus: 'cancelled' }
          : apt
      ));
      closeAppointmentModal();
      alert('Appointment cancelled successfully');
    }
  };

  const handleReschedule = () => {
    if (selectedAppointment && rescheduleDate && rescheduleTime) {
      setAppointments(prev => prev.map(apt => 
        apt.id === selectedAppointment.id 
          ? { ...apt, date: rescheduleDate, time: rescheduleTime }
          : apt
      ));
      closeAppointmentModal();
      alert('Appointment rescheduled successfully');
    }
  };

  const getFilteredAppointments = () => {
    let filtered = appointments.filter(apt => apt.status === appointmentFilter);
    
    if (serviceFilter !== 'all') {
      filtered = filtered.filter(apt => 
        apt.service.toLowerCase().includes(serviceFilter.toLowerCase())
      );
    }
    
    return filtered;
  };

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      
      {/* --- MINIMAL SIDEBAR --- */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-16'
        } bg-white flex flex-col transition-all duration-300 ease-in-out relative z-30 shadow-lg`}
      >
        {/* Hamburger Menu */}
        <div className="h-16 flex items-center px-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Icons */}
        <nav className="flex-1 py-6 overflow-hidden">
          <div className="space-y-2 px-2">
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center gap-3 p-3 text-gray-600 hover:bg-gray-50 rounded-lg transition-all group"
              title="New Chat"
            >
              <SquarePen className="w-5 h-5 flex-shrink-0" />
              <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 overflow-hidden'
              }`}>
                New Chat
              </span>
            </button>

            <div className={`space-y-2 transition-all duration-300 overflow-hidden ${
              isSidebarOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
            }`}>
              <button 
                onClick={() => setCurrentView('appointments')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                  currentView === 'appointments' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="My Appointments"
              >
                <Calendar className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">My Appointments</span>
              </button>

              <button 
                onClick={() => setCurrentView('help')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${
                  currentView === 'help' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="Help/FAQs"
              >
                <MessageCircleQuestion className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">Help/FAQs</span>
              </button>
            </div>

            {/* Recent Chats Section - After Help/FAQs */}
            <div className={`transition-all duration-300 overflow-hidden ${
              isSidebarOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}>
              <div className="h-px bg-gray-200 my-3 mx-2"></div>
              
              <div className="pt-2 pb-2 px-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recent</p>
              </div>
              
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {chatHistory.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => loadChatHistory(chat.id)}
                    className={`w-full flex flex-col items-start p-3 rounded-lg transition-all hover:bg-gray-50 ${
                      currentChatId === chat.id ? 'bg-gray-100' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-700 truncate w-full text-left">
                      {chat.title}
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5">{chat.timestamp}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* User Profile at Bottom */}
        <div className="p-3">
          <div className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-all ${!isSidebarOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 flex-shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-300 overflow-hidden ${
              isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'
            }`}>
              <p className="text-sm font-medium text-gray-700 truncate">Alice Gong</p>
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
      <main 
        ref={mainContainerRef}
        onScroll={handleScroll}
        className="flex-1 h-screen overflow-y-auto bg-white relative scroll-smooth"
      >
        <div className="min-h-full flex flex-col">
          
          {/* Logo Header - Always Visible */}
          <header className="h-16 flex items-center px-6">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="VetConnect" className="w-8 h-8 object-contain" />
              <span className="text-xl font-semibold text-[#099FAD]">VetConnect</span>
            </div>
          </header>

          {/* Render different views based on currentView */}
          {currentView === 'appointments' ? (
            /* --- MY APPOINTMENTS VIEW --- */
            <div className="flex-1 px-6 py-8 overflow-y-auto">
              <div className="max-w-5xl mx-auto">
                {/* Header Section */}
                <div className="text-center mb-8">
                  <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 bg-[#099FAD]/10 rounded-full flex items-center justify-center">
                      <Calendar className="w-8 h-8 text-[#099FAD]" />
                    </div>
                  </div>
                  
                  <h1 className="text-3xl font-semibold text-[#099FAD] mb-2">
                    My Appointments
                  </h1>
                  <p className="text-sm text-gray-500">
                    Keep track of your furbaby's health journey.
                  </p>
                </div>

                 {/* Tabs and Filter Row */}
                <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
                  {/* Tabs */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAppointmentFilter('upcoming')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all focus:outline-none border ${
                        appointmentFilter === 'upcoming'
                          ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30'
                          : 'text-gray-600 hover:bg-gray-50 border-transparent'
                      }`}
                    >
                      Upcoming
                    </button>
                    <button
                      onClick={() => setAppointmentFilter('past')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all focus:outline-none border ${
                        appointmentFilter === 'past'
                          ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30'
                          : 'text-gray-600 hover:bg-gray-50 border-transparent'
                      }`}
                    >
                      Past
                    </button>
                    <button
                      onClick={() => setAppointmentFilter('cancelled')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all focus:outline-none border ${
                        appointmentFilter === 'cancelled'
                          ? 'bg-white text-gray-900 shadow-sm border-[#088a96]/30'
                          : 'text-gray-600 hover:bg-gray-50 border-transparent'
                      }`}
                    >
                      Cancelled
                    </button>
                  </div>

                  {/* Filter Dropdown */}
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </div>
                    <select 
                      value={serviceFilter}
                      onChange={(e) => setServiceFilter(e.target.value)}
                      className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20 cursor-pointer shadow-sm hover:border-gray-300 transition-all"
                    >
                      <option value="all">All Services</option>
                      <option value="consultation">Consultation / Check-up</option>
                      <option value="vaccination">Vaccination</option>
                      <option value="grooming">Grooming</option>
                      <option value="spay">Spay & Neuter (Kapon)</option>
                      <option value="deworming">Deworming</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Appointments Grid */}
                {getFilteredAppointments().length === 0 ? (
                  <div className="text-center py-16">
                    <div className="p-12 inline-block">
                      <p className="text-gray-600">
                        {serviceFilter !== 'all' 
                          ? `No ${appointmentFilter} appointments found for this service.`
                          : `You don't have any ${appointmentFilter} appointments yet.`
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getFilteredAppointments().map((apt) => (
                        <div 
                          key={apt.id} 
                          className="bg-white border border-[#099FAD]/30 rounded-2xl p-6 flex flex-col items-center text-center hover:shadow-md transition-shadow"
                        >
                          {/* Pet Icon/Avatar */}
                          <div className="w-16 h-16 bg-[#099FAD]/10 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-10 h-10 text-[#099FAD]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 6c-2.21 0-4-1.79-4-4h-1c0 2.76 2.24 5 5 5s5-2.24 5-5h-1c0 2.21-1.79 4-4 4z"/>
                            </svg>
                          </div>

                          {/* Pet Name */}
                          <h3 className="text-xl font-semibold text-[#099FAD] mb-1">
                            {apt.petName}
                          </h3>

                          {/* Species & Service */}
                          <p className="text-sm text-gray-600 mb-1">
                            Species: {apt.species}
                          </p>
                          <p className="text-sm text-gray-600 mb-3">
                            {apt.service}
                          </p>

                          {/* Date & Time */}
                          <p className="text-xs text-gray-500 mb-4">
                            {apt.date} {apt.time}
                          </p>

                          {/* View More Button */}
                          <button 
                            onClick={() => openAppointmentModal(apt)}
                            className="bg-[#099FAD] text-white text-sm font-medium px-6 py-2 rounded-full hover:bg-[#088a96] transition-colors"
                          >
                            View more
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* Appointment Details Modal */}
                {showAppointmentModal && selectedAppointment && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl animate-scaleIn">
                      {/* Close Button */}
                      <button 
                        onClick={closeAppointmentModal}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-all"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>

                      <h3 className="text-xl font-bold text-gray-900 mb-5">Appointment Details</h3>

                      {/* Appointment Info */}
                      <div className="space-y-4 mb-6">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Species</p>
                          <p className="text-base font-semibold text-gray-900">{selectedAppointment.species}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Service</p>
                          <p className="text-base font-semibold text-gray-900">{selectedAppointment.service}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Date & Time</p>
                          <p className="text-base font-semibold text-gray-900">{selectedAppointment.date} {selectedAppointment.time}</p>
                        </div>
                        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Status:</p>
                          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${
                            selectedAppointment.appointmentStatus === 'confirmed' ? 'bg-green-100 text-green-700' :
                            selectedAppointment.appointmentStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              selectedAppointment.appointmentStatus === 'confirmed' ? 'bg-green-600' :
                              selectedAppointment.appointmentStatus === 'pending' ? 'bg-yellow-600' :
                              'bg-gray-600'
                            }`}></span>
                            {selectedAppointment.appointmentStatus.charAt(0).toUpperCase() + selectedAppointment.appointmentStatus.slice(1)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-[#099FAD]/5 rounded-lg p-3 border border-[#099FAD]/20">
                          <p className="text-xs text-gray-600">Assigned Vet:</p>
                          <p className="text-sm font-semibold text-[#099FAD]">{selectedAppointment.assignedVet}</p>
                        </div>
                      </div>

                      {/* Reschedule Date Picker */}
                      {showRescheduler && (
                        <div className="mb-6 p-5 bg-gradient-to-br from-[#099FAD]/5 to-[#099FAD]/10 rounded-xl border border-[#099FAD]/20 space-y-4">
                          <div className="flex items-center gap-2 mb-3">
                            <svg className="w-5 h-5 text-[#099FAD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <h4 className="font-semibold text-gray-900">Select New Date & Time</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium text-gray-700 block mb-2">Date</label>
                              <input 
                                type="date"
                                value={rescheduleDate}
                                onChange={(e) => setRescheduleDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20 transition-all"
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700 block mb-2">Time</label>
                              <input 
                                type="time"
                                value={rescheduleTime}
                                onChange={(e) => setRescheduleTime(e.target.value)}
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#099FAD] focus:ring-2 focus:ring-[#099FAD]/20 transition-all"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleReschedule}
                            disabled={!rescheduleDate || !rescheduleTime}
                            className="w-full bg-[#099FAD] text-white text-sm font-semibold px-4 py-3 rounded-lg hover:bg-[#088a96] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                          >
                            Confirm Reschedule
                          </button>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {!showRescheduler && (
                        <div className="flex gap-3">
                          {selectedAppointment.status === 'upcoming' && (
                            <button 
                              onClick={handleCancelAppointment}
                              className="flex-1 bg-[#BC1610] text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-[#AF1510] transition-all shadow-sm hover:shadow-md"
                            >
                              Cancel Appointment
                            </button>
                          )}
                          {selectedAppointment.appointmentStatus === 'pending' && selectedAppointment.status === 'upcoming' && (
                            <button 
                              onClick={() => setShowRescheduler(true)}
                              className="flex-1 bg-[#F0F4F8] text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-[#E6EAEE] transition-all shadow-sm"
                            >
                              Reschedule
                            </button>
                          )}
                        </div>
                      )}

                      {selectedAppointment.status === 'past' && !showRescheduler && (
                        <p className="text-sm text-gray-500 text-center mt-4">
                          This appointment has been completed
                        </p>
                      )}

                      {selectedAppointment.appointmentStatus !== 'pending' && selectedAppointment.status === 'upcoming' && !showRescheduler && (
                        <p className="text-xs text-gray-500 text-center mt-4">
                          Rescheduling is only available for pending appointments
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : currentView === 'help' ? (
            /* --- HELP/FAQs VIEW --- */
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
              <div className="text-center max-w-2xl">
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 bg-[#099FAD]/10 rounded-full flex items-center justify-center">
                    <MessageCircleQuestion className="w-8 h-8 text-[#099FAD]" />
                  </div>
                </div>
                
                <h1 className="text-3xl font-semibold text-[#099FAD] mb-2">
                  Help & FAQs
                </h1>
                <p className="text-sm text-gray-500 mb-8">
                  Find answers to common questions
                </p>
                
                <div className="text-left space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-900 mb-2">How do I book an appointment?</h3>
                    <p className="text-sm text-gray-600">Simply chat with our AI assistant and mention you'd like to book an appointment. We'll guide you through the process!</p>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-900 mb-2">What are your clinic hours?</h3>
                    <p className="text-sm text-gray-600">We're open Monday to Saturday from 8:00 AM to 6:00 PM.</p>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-900 mb-2">Can I cancel or reschedule?</h3>
                    <p className="text-sm text-gray-600">Yes! Just let our assistant know and we'll help you reschedule or cancel your appointment.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* --- CENTERED HERO VIEW --- */
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="w-full max-w-2xl text-center">
                
                {/* Greeting */}
                <p className="text-sm text-gray-600 mb-2">Hi Alice</p>
                
                {/* Main Heading */}
                <h1 className="text-4xl font-normal text-gray-900 mb-12">
                  Where should we start?
                </h1>

                {/* Input Bar */}
                <form onSubmit={handleSend} className="w-full relative mb-6">
                  <input 
                    type="text" 
                    value={inputText} 
                    onChange={(e) => setInputText(e.target.value)} 
                    placeholder="Enter a prompt..." 
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

                {/* Suggestion Pills */}
                <div className="flex flex-wrap justify-center gap-2">
                  {['Book an appointment', 'Check clinic hours', 'Available services', 'Vet availability'].map((text) => (
                    <button 
                      key={text} 
                      onClick={() => handleSuggestionClick(text)} 
                      className="bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm py-2 px-4 rounded-full transition-all"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          ) : (
            /* --- ACTIVE CHAT VIEW --- */
            <>
              <div className="flex-1 px-4 max-w-4xl mx-auto w-full py-6">
                <div className="space-y-6">
                  {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-5 py-3.5 text-base leading-relaxed ${
                        msg.sender === 'user' 
                          ? 'bg-[#099FAD] text-white rounded-br-md' 
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-5 py-3.5 flex gap-1.5">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Sticky Footer Input */}
              <div className="sticky bottom-0 w-full bg-white py-4 px-4">
                <div className="w-full max-w-3xl mx-auto relative">
                  {showScrollBtn && (
                    <button 
                      onClick={scrollToBottom}
                      className="absolute -top-12 left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center bg-white rounded-full shadow-md text-gray-600 hover:text-[#099FAD] transition-all"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  )}

                  <form onSubmit={handleSend} className="w-full relative">
                    <input 
                      type="text" 
                      value={inputText} 
                      onChange={(e) => setInputText(e.target.value)} 
                      placeholder="Enter a prompt..." 
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
                  
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    VetConnect can make mistakes. Check important info.
                  </p>
                </div>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
};

export default Dashboard;