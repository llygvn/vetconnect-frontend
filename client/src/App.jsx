import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import AdminDashboard from './AdminDashboard';
import EmailVerification from './EmailVerification';
import VerifyEmail from './VerifyEmail';

function App() {
  const [userRole, setUserRole] = useState(null);

  const handleLogin  = (role) => setUserRole(role);
  const handleLogout = ()     => setUserRole(null);

  return (
    <BrowserRouter>
      <Routes>

        {/* "Check your email" waiting screen — shown after signup */}
        <Route path="/email-verification" element={<EmailVerification />} />

        {/* Handles the link from the verification email: /verify/:token */}
        <Route path="/verify/:token" element={<VerifyEmail />} />

        {/* Main app */}
        <Route
          path="/*"
          element={
            !userRole ? (
              <Login onLogin={handleLogin} />
            ) : userRole === 'admin' ? (
              <AdminDashboard onLogout={handleLogout} />
            ) : (
              <Dashboard onLogout={handleLogout} />
            )
          }
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;