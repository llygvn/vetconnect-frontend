import React, { useState } from 'react';
import Login from './Login';
import Dashboard from './dashboard';
import AdminDashboard from './admindashboard'; // Siguraduhin na naka-import ito

function App() {
  // Ang state ngayon ay pwedeng: null (hindi pa login), 'user', o 'admin'
  const [userRole, setUserRole] = useState(null);

  // Bagong handleLogin na tumatanggap ng role galing sa Login.jsx
  const handleLogin = (role) => {
    setUserRole(role); // Itatakda nito kung 'user' o 'admin'
  };

  const handleLogout = () => {
    setUserRole(null); // Babalik sa login screen
  };

  return (
    <div>
      {!userRole ? (
        // 1. Kapag NULL, ipakita ang Login page
        <Login onLogin={handleLogin} />
      ) : userRole === 'admin' ? (
        // 2. Kapag 'admin', ipakita ang Admin Dashboard
        <AdminDashboard onLogout={handleLogout} />
      ) : (
        // 3. Kapag 'user' (o kahit ano pa), ipakita ang regular Dashboard
        <Dashboard onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;