import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, RefreshCw } from 'lucide-react';
import logoImg from './assets/logo.png';
import API from './api';

const EmailVerification = () => {
  // Read the email passed via navigate('/email-verification', { state: { email } })
  const { state } = useLocation();
  const email = state?.email || '';

  const navigate = useNavigate();
  const [resendStatus, setResendStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'

  const handleResend = async () => {
    setResendStatus('sending');
    try {
      await API.post('/api/resend-verification', { email });
      setResendStatus('sent');
    } catch {
      setResendStatus('error');
    } finally {
      setTimeout(() => setResendStatus('idle'), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-16 py-16 px-6 font-sans">

      {/* LOGO */}
      <div className="flex items-center gap-2">
        <img src={logoImg} alt="VetConnect Logo" className="w-9 h-9 object-contain" />
        <span className="text-2xl font-medium tracking-tight text-[#099FAD] font-branding">
          VetConnect
        </span>
      </div>

      {/* CONTENT */}
      <div className="flex flex-col items-center text-center w-full max-w-sm gap-10">

        {/* ICON */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[#099FAD]/10 flex items-center justify-center">
            <Mail className="w-7 h-7 text-[#099FAD]" />
          </div>
          <p className="text-sm text-gray-400 tracking-widest uppercase">Check your email</p>
        </div>

        {/* MESSAGE */}
        <div className="flex flex-col gap-2">
          <p className="text-gray-700 text-sm font-medium">
            We sent a verification link to:
          </p>
          {email && (
            <p className="text-[#099FAD] text-sm font-semibold break-all">{email}</p>
          )}
          <p className="text-gray-400 text-sm mt-1">
            Click the link in the email to activate your account.
            It may take a few minutes to arrive.
          </p>
        </div>

        {/* BUTTONS */}
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={handleResend}
            disabled={resendStatus === 'sending' || resendStatus === 'sent'}
            className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] disabled:bg-[#099FAD]/50 text-white font-semibold py-3 rounded-full transition-colors text-sm shadow-lg shadow-[#099FAD]/25 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${resendStatus === 'sending' ? 'animate-spin' : ''}`} />
            {resendStatus === 'idle'    && 'Resend verification email'}
            {resendStatus === 'sending' && 'Sending…'}
            {resendStatus === 'sent'    && 'Email sent!'}
            {resendStatus === 'error'   && 'Failed to send. Try again.'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="cursor-pointer w-full border border-gray-200 hover:border-[#099FAD] text-gray-400 hover:text-[#099FAD] py-3 rounded-full transition-colors text-sm"
          >
            Back to Login
          </button>
        </div>

      </div>
    </div>
  );
};

export default EmailVerification;