import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu,           
  SquarePen,      
  Calendar,       
  MessageCircleQuestion, 
  User,           
  Send, 
  LogOut          
} from 'lucide-react';
import logoImg from './assets/logo.png'; 

const Dashboard = ({ onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Chat States
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // --- AUTO SCROLL ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

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

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-72' : 'w-20'
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative z-20 shadow-sm`}
      >
        
        {/* TOP SECTION */}
        <div className="flex flex-col">
            {/* 1. Hamburger Menu (Aligned at 32px effectively: px-6 + p-2) */}
            <div className={`h-20 flex items-center transition-all duration-300 ${isSidebarOpen ? 'px-6' : 'justify-center w-full'}`}>
              <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
              >
                  <Menu className="w-6 h-6" />
              </button>
            </div>

            {/* 2. New Chat Button (Adjusted padding to match Hamburger alignment) */}
            {/* Changed 'px-4' to 'px-5' when open. 20px (px-5) + 12px (p-3) = 32px */}
            <div className={`transition-all duration-300 ${isSidebarOpen ? 'px-5' : 'w-full flex justify-center'}`}>
                <button className={`flex items-center gap-4 p-3 text-gray-700 hover:bg-gray-100 rounded-xl transition-all group ${isSidebarOpen ? 'w-full' : ''}`}>
                    <SquarePen className="w-6 h-6 text-gray-500 group-hover:text-[#099FAD] flex-shrink-0" />
                    
                    <span className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
                      isSidebarOpen ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0 hidden'
                    }`}>
                      New Chat
                    </span>
                </button>
            </div>
        </div>

        {/* MIDDLE SECTION: APPOINTMENTS & HELP */}
        {/* Changed 'px-4' to 'px-5' here as well to align with New Chat & Hamburger */}
        <nav className={`px-5 space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'
        }`}>
          
          <button className="flex items-center gap-4 w-full p-3 text-gray-700 hover:bg-gray-100 rounded-xl transition-all group">
            <Calendar className="w-6 h-6 text-gray-500 group-hover:text-[#099FAD] flex-shrink-0" />
            <span className="font-medium whitespace-nowrap">
              My Appointments
            </span>
          </button>

          <button className="flex items-center gap-4 w-full p-3 text-gray-700 hover:bg-gray-100 rounded-xl transition-all group">
            <MessageCircleQuestion className="w-6 h-6 text-gray-500 group-hover:text-[#099FAD] flex-shrink-0" />
            <span className="font-medium whitespace-nowrap">
              Help/FAQs
            </span>
          </button>

        </nav>
        
        {/* Spacer */}
        <div className="flex-1"></div>

        {/* USER PROFILE (Bottom) */}
        <div className="p-4 border-t border-gray-100">
          <div className={`flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-all duration-300 ${!isSidebarOpen ? 'justify-center' : ''}`}>
            
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
               <User className="w-5 h-5" /> 
            </div>
            
            {/* Profile Name */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isSidebarOpen ? 'max-w-32 opacity-100' : 'max-w-0 opacity-0'
            }`}>
              <p className="text-sm font-bold text-gray-700 whitespace-nowrap">Alice Gong</p>
              <button onClick={onLogout} className="text-xs text-[#099FAD] hover:underline flex items-center gap-1">
                Log out <LogOut className="w-3 h-3"/>
              </button>
            </div>
          </div>
        </div>
      </aside>


      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col relative h-full">
        {/* Header Logo uses px-8 (32px), matching our new sidebar alignment */}
        <header className="h-20 flex items-center px-8 bg-gray-50">
          <span className="text-2xl font-bold text-[#099FAD] tracking-tight">
            VetConnect
          </span>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4 max-w-5xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="text-center space-y-8 animate-fade-in mt-[-100px]">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                   <img src={logoImg} alt="Bot" className="w-10 h-10 object-contain" />
                </div>
                <h1 className="text-3xl font-semibold text-gray-800">
                  Hi Alice<br/>
                  <span className="text-gray-900">Where should we start?</span>
                </h1>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 w-full max-w-4xl">
                {['Book an appointment', 'Check clinic hours', 'Available services', 'Vet availability'].map((text) => (
                  <button key={text} onClick={() => setInputText(text)} className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 text-sm font-medium py-3 px-4 rounded-xl shadow-sm hover:shadow transition-all text-center whitespace-nowrap">
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 w-full overflow-y-auto px-4 space-y-6 mb-6 custom-scrollbar">
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-6 py-4 text-base leading-relaxed shadow-sm ${msg.sender === 'user' ? 'bg-[#099FAD] text-white rounded-br-none' : 'bg-white text-gray-700 border border-gray-100 rounded-bl-none'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start"><div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-6 py-4 shadow-sm flex gap-1"><span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></span><span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></span></div></div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
          <div className="w-full max-w-3xl mt-auto pt-6">
             <form onSubmit={handleSend} className="relative group">
              <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Enter a prompt..." className="w-full bg-white border border-gray-200 text-gray-800 placeholder-gray-400 rounded-full py-4 pl-8 pr-16 shadow-lg shadow-gray-200/50 focus:outline-none focus:ring-2 focus:ring-[#099FAD]/50 focus:border-[#099FAD] transition-all text-lg" />
              <button type="submit" disabled={!inputText.trim()} className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-[#099FAD] text-white rounded-full hover:bg-[#088a96] disabled:opacity-50 disabled:hover:bg-[#099FAD] transition-all"><Send className="w-5 h-5" /></button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;