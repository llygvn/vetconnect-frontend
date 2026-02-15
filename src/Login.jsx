import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, User } from 'lucide-react';
import logoImg from './assets/logo.png';
import bgPattern from './assets/pattern.png';

const Login = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true); 
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [errors, setErrors] = useState({ username: '', email: '', password: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const toggleMode = (loginMode) => {
    setIsLogin(loginMode);
    setErrors({ username: '', email: '', password: '' });
    setFormData({ username: '', email: '', password: '' });
  };

  const handleAuthAction = (e) => {
    e.preventDefault();
    let hasError = false;
    
    // Basic validation
    if (!formData.email || !formData.password) {
      alert("Please fill in the fields");
      return;
    }

    if (isLogin) {
      // --- ADMIN LOGIN LOGIC ---
      // Dito natin chine-check kung admin ang nag-log in
      if (formData.email === "admin@vetconnect.com" && formData.password === "admin123") {
        onLogin('admin'); // Ipapasa ang 'admin' role sa App.jsx
      } else {
        // Default ay 'user' role
        onLogin('user'); 
      }
    } else {
      // Signup logic
      alert("Account created successfully! Logging you in...");
      onLogin('user'); 
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-sans">
      
      {/* CARD CONTAINER */}
      <div className="bg-white rounded-[30px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row w-full max-w-lg md:max-w-[1200px] h-auto md:h-[800px]">
        
        {/* LEFT SIDE (FORM) */}
        <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center relative">
          
          {/* LOGO */}
          <div className="flex items-center gap-3 md:gap-4 mb-8 md:mb-12">
            <img src={logoImg} alt="VetConnect Logo" className="w-12 h-12 md:w-16 md:h-16 object-contain" />
            <span className="text-3xl md:text-4xl font-medium tracking-tight text-[#099FAD] font-branding">
              VetConnect
            </span>
          </div>

          <h2 className="text-3xl md:text-4xl font-regular text-gray-800 mb-2">
            {isLogin ? 'Welcome back!' : 'Create account'}
          </h2>
          
          <p className="text-base md:text-lg font-light text-gray-500 mb-8">
            {isLogin ? "Let's take care of your pet today." : "Start managing your pet's care today."}
          </p>

          {/* Toggle Switch */}
          <div className="flex bg-white border border-gray-200 rounded-full p-1 md:p-1.5 mb-6 md:mb-8 w-full max-w-md mx-auto md:mx-0">
            <button
              type="button"
              onClick={() => toggleMode(true)}
              className={`cursor-pointer flex-1 py-2.5 md:py-3 px-6 rounded-full text-sm md:text-base font-regular transition-all duration-200 ${
                isLogin ? 'bg-[#099FAD] text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => toggleMode(false)}
              className={`cursor-pointer flex-1 py-2.5 md:py-3 px-6 rounded-full text-sm md:text-base font-regular transition-all duration-200 ${
                !isLogin ? 'bg-[#099FAD] text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign up
            </button>
          </div>

          {/* FORM */}
          <form className="w-full md:pr-6" onSubmit={handleAuthAction}>
            
            {!isLogin && (
              <div className="relative mb-4 md:mb-6">
                <input 
                  name="username"
                  type="text" 
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Username"
                  className="w-full pl-7 pr-12 py-3 md:py-4 border border-gray-200 rounded-full focus:outline-none focus:ring-4 focus:ring-[#099FAD]/20 focus:border-[#099FAD] transition-all text-sm md:text-lg"
                />
                <User className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-gray-400" />
              </div>
            )}

            <div className="relative mb-4 md:mb-6">
              <input 
                name="email"
                type="text" 
                value={formData.email}
                onChange={handleChange}
                placeholder={isLogin ? "Email or username" : "Email"}
                className="w-full pl-7 pr-12 py-3 md:py-4 border border-gray-200 rounded-full focus:outline-none focus:ring-4 focus:ring-[#099FAD]/20 focus:border-[#099FAD] transition-all text-sm md:text-lg"
              />
              <Mail className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-gray-400" />
            </div>

            <div className="relative mb-4 md:mb-6">
              <input 
                name="password"
                type={showPassword ? "text" : "password"} 
                value={formData.password}
                onChange={handleChange}
                placeholder="Password"
                className="w-full pl-7 pr-12 py-3 md:py-4 border border-gray-200 rounded-full focus:outline-none focus:ring-4 focus:ring-[#099FAD]/20 focus:border-[#099FAD] transition-all text-sm md:text-lg"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="cursor-pointer absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <Eye className="w-5 h-5 md:w-6 md:h-6" /> : <EyeOff className="w-5 h-5 md:w-6 md:h-6" />}
              </button>
            </div>

            <button 
              type="submit"
              className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-bold py-3 md:py-4 rounded-full transition-colors mt-2 md:mt-4 shadow-xl shadow-[#099FAD]/30 text-sm md:text-lg"
            >
              {isLogin ? 'Log in' : 'Create account'}
            </button>

          </form>

          <div className="mt-6 md:mt-8 text-sm md:text-base text-gray-500 text-center md:text-left">
            {isLogin ? "No account?" : "Have an account?"} 
            <button onClick={() => toggleMode(!isLogin)} className="cursor-pointer text-[#099FAD] font-regular hover:underline ml-2">
              {isLogin ? "Sign up" : "Log in"}
            </button>
          </div>
        </div>

        {/* RIGHT SIDE (IMAGE) */}
        <div className="hidden md:block w-1/2 relative overflow-hidden bg-gray-50 h-full">
          <img src={bgPattern} alt="Background" className="absolute inset-0 w-full h-full object-cover" />
        </div>

      </div>
    </div>
  );
};

export default Login;