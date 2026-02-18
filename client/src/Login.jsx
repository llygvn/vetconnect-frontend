import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, User } from 'lucide-react';
import logoImg from './assets/logo.png';
import bgPattern from './assets/pattern.png';
import API from "./api";
import { useNavigate } from 'react-router-dom';

// FIX: Import shared regex instead of duplicating it here
import { strongPasswordRegex } from './shared/validation.js';

const Login = ({ onLogin }) => {
  const navigate = useNavigate();

  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  // FIX: Replaced fragile string-keyword message classifier with a typed { text, type } state.
  // Previously the component checked if the string contained words like "failed" or "must"
  // to decide the color — any server message containing those words would be misclassified.
  const [message, setMessage] = useState({ text: '', type: 'error' });
  const [loading, setLoading] = useState(false);
  const [showVerifyPopup, setShowVerifyPopup] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleMode = (loginMode) => {
    setIsLogin(loginMode);
    setFormData({ username: '', email: '', password: '' });
    setMessage({ text: '', type: 'error' });
  };

  const handleAuthAction = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: 'error' });

    if (!formData.email || !formData.password) {
      setMessage({ text: 'Please fill in all required fields.', type: 'error' });
      return;
    }

    setLoading(true);

    try {
      if (!isLogin) {
        // ── SIGN UP ──────────────────────────────────────────────
        if (!formData.username) {
          setMessage({ text: 'Please enter a username.', type: 'error' });
          setLoading(false);
          return;
        }
        if (!strongPasswordRegex.test(formData.password)) {
          setMessage({
            text: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.',
            type: 'error',
          });
          setLoading(false);
          return;
        }

        await API.post('/api/register', {
          username: formData.username,
          email:    formData.email,
          password: formData.password,
        });

        setRegisteredEmail(formData.email);
        setShowVerifyPopup(true);

      } else {
        // ── LOG IN ───────────────────────────────────────────────
        const res = await API.post('/api/login', {
          email:    formData.email,
          password: formData.password,
        });

        localStorage.setItem('token', res.data.token);
        onLogin(res.data.role);
      }
    } catch (err) {
      console.error('Auth error:', err);
      const detail =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        (isLogin ? 'Login failed.' : 'Signup failed.');
      setMessage({ text: `Error: ${detail}`, type: 'error' });
    } finally {
      setLoading(false);
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

          {/* FIX: Message box uses typed `message.type` — no more fragile string matching */}
          {message.text && (
            <div className={`mb-4 text-sm md:text-base px-4 py-3 rounded-xl ${
              message.type === 'error'
                ? 'bg-red-50 text-red-600'
                : 'bg-green-50 text-green-600'
            }`}>
              {message.text}
            </div>
          )}

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
                
                placeholder="Email"
                className="w-full pl-7 pr-12 py-3 md:py-4 border border-gray-200 rounded-full focus:outline-none focus:ring-4 focus:ring-[#099FAD]/20 focus:border-[#099FAD] transition-all text-sm md:text-lg"
              />
              <Mail className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 text-gray-400" />
            </div>

            <div className="relative mb-4 md:mb-6">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                placeholder="Password"
                className="w-full pl-7 pr-12 py-3 md:py-4 border border-gray-200 rounded-full focus:outline-none focus:ring-4 focus:ring-[#099FAD]/20 focus:border-[#099FAD] transition-all text-sm md:text-lg"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="cursor-pointer absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword
                  ? <Eye className="w-5 h-5 md:w-6 md:h-6" />
                  : <EyeOff className="w-5 h-5 md:w-6 md:h-6" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] disabled:opacity-60 text-white font-bold py-3 md:py-4 rounded-full transition-colors mt-2 md:mt-4 shadow-xl shadow-[#099FAD]/30 text-sm md:text-lg"
            >
              {loading ? 'Please wait…' : (isLogin ? 'Log in' : 'Create account')}
            </button>

          </form>

          <div className="mt-6 md:mt-8 text-sm md:text-base text-gray-500 text-center md:text-left">
            {isLogin ? 'No account?' : 'Have an account?'}
            <button
              onClick={() => toggleMode(!isLogin)}
              className="cursor-pointer text-[#099FAD] font-regular hover:underline ml-2"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>

        {/* RIGHT SIDE (IMAGE) */}
        <div className="hidden md:block w-1/2 relative overflow-hidden bg-gray-50 h-full">
          <img src={bgPattern} alt="Background" className="absolute inset-0 w-full h-full object-cover" />
        </div>

      </div>

      {/* ── Email sent popup ── */}
      {showVerifyPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl flex flex-col items-center text-center gap-5 animate-scaleIn">
            <div className="w-16 h-16 rounded-full bg-[#099FAD]/10 flex items-center justify-center">
              <Mail className="w-8 h-8 text-[#099FAD]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Check your email</h3>
              <p className="text-sm text-gray-500">We sent a verification link to:</p>
              <p className="text-sm font-semibold text-[#099FAD] mt-1 break-all">{registeredEmail}</p>
              <p className="text-xs text-gray-400 mt-2">Click the link to activate your account. It may take a few minutes.</p>
            </div>
            <button
              onClick={() => {
                setShowVerifyPopup(false);
                navigate('/email-verification', { state: { email: registeredEmail } });
              }}
              className="w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-semibold py-3 rounded-full transition-colors text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;