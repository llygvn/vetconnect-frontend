import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Mail } from 'lucide-react';
import logoImg from './assets/logo.png';

const VerificationSuccess = () => {
  const navigate = useNavigate();

  const params   = new URLSearchParams(window.location.search);
  const status   = params.get('status') || 'error';
  const errorMsg = params.get('msg')    || 'This link may have expired or already been used.';

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

        {status === 'ok' && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[#099FAD]/10 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-[#099FAD]" />
              </div>
              <p className="text-sm text-gray-400 tracking-widest uppercase">Email Verified</p>
            </div>
            <p className="text-gray-500 text-sm">
              Your account is now active. You can log in and start managing your pet's care.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => navigate('/')}
                className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-semibold py-3 rounded-full transition-colors text-sm shadow-lg shadow-[#099FAD]/25"
              >
                Go to Login
              </button>
            </div>
          </>
        )}

        {status === 'already' && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-sm text-gray-400 tracking-widest uppercase">Already Verified</p>
            </div>
            <p className="text-gray-500 text-sm">
              This email has already been verified. You can log in to your account.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => navigate('/')}
                className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-semibold py-3 rounded-full transition-colors text-sm shadow-lg shadow-[#099FAD]/25"
              >
                Go to Login
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <XCircle className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-sm text-gray-400 tracking-widest uppercase">Verification Failed</p>
            </div>
            <p className="text-gray-500 text-sm">
              {decodeURIComponent(errorMsg)}
            </p>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => navigate('/email-verification')}
                className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-semibold py-3 rounded-full transition-colors text-sm shadow-lg shadow-[#099FAD]/25 flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Resend verification email
              </button>
              <button
                onClick={() => navigate('/')}
                className="cursor-pointer w-full border border-gray-200 hover:border-[#099FAD] text-gray-400 hover:text-[#099FAD] py-3 rounded-full transition-colors text-sm"
              >
                Back to Login
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default VerificationSuccess;