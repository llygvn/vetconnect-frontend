import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import logoImg from './assets/logo.png';
import API from './api';

// ─────────────────────────────────────────────────────────────────────────────
// This page lives at /verify/:token
// The backend sends email links pointing here, e.g.:
//   http://localhost:5173/verify/abc123...
//
// On mount it calls GET /api/verify/:token → backend verifies the user
// and returns JSON { ok: true } or { error: '...' }
// ─────────────────────────────────────────────────────────────────────────────

const VerifyEmail = () => {
  const { token } = useParams();
  const navigate  = useNavigate();
  // If there's no token at all, skip the loading state entirely
  const [status,   setStatus]   = useState(() => token ? 'loading' : 'error');
  const [errorMsg, setErrorMsg] = useState(() => token ? '' : 'No verification token found.');
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token || calledRef.current) return;
    calledRef.current = true;

    API.get(`/api/verify/${token}`)
      .then(res => {
        setStatus(res.data.status || 'ok');
      })
      .catch(err => {
        const msg = err.response?.data?.error || 'This link may have expired or already been used.';
        setStatus(err.response?.data?.status || 'error');
        setErrorMsg(msg);
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-16 py-16 px-6 font-sans">

      {/* LOGO */}
      <div className="flex items-center gap-2">
        <img src={logoImg} alt="VetConnect Logo" className="w-9 h-9 object-contain" />
        <span className="text-2xl font-medium tracking-tight text-[#099FAD] font-branding">
          VetConnect
        </span>
      </div>

      <div className="flex flex-col items-center text-center w-full max-w-sm gap-10">

        {/* LOADING */}
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#099FAD]/10 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-[#099FAD] animate-spin" />
            </div>
            <p className="text-sm text-gray-400 tracking-widest uppercase">Verifying…</p>
            <p className="text-gray-500 text-sm">Please wait while we verify your email.</p>
          </div>
        )}

        {/* SUCCESS */}
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
            <button
              onClick={() => navigate('/')}
              className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-semibold py-3 rounded-full transition-colors text-sm shadow-lg shadow-[#099FAD]/25"
            >
              Go to Login
            </button>
          </>
        )}

        {/* ALREADY VERIFIED */}
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
            <button
              onClick={() => navigate('/')}
              className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-semibold py-3 rounded-full transition-colors text-sm shadow-lg shadow-[#099FAD]/25"
            >
              Go to Login
            </button>
          </>
        )}

        {/* ERROR */}
        {status === 'error' && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <XCircle className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-sm text-gray-400 tracking-widest uppercase">Verification Failed</p>
            </div>
            <p className="text-gray-500 text-sm">{errorMsg}</p>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => navigate('/email-verification')}
                className="cursor-pointer w-full bg-[#099FAD] hover:bg-[#078C98] text-white font-semibold py-3 rounded-full transition-colors text-sm shadow-lg shadow-[#099FAD]/25"
              >
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

export default VerifyEmail;