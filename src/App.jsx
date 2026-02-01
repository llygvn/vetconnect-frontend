import React, { useState } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';

function App() {
  // State: false = nasa Login page, true = nasa Dashboard
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Function na ipapasa natin sa Login component
  const handleLogin = () => {
    setIsAuthenticated(true); // Ito ang magti-trigger ng switch
  };

  // Function na ipapasa natin sa Dashboard component
  const handleLogout = () => {
    setIsAuthenticated(false); // Babalik sa login screen
  };

  return (
    <div>
      {isAuthenticated ? (
        // Kapag TRUE, ipakita ang Dashboard (at ipasa ang logout function)
        <Dashboard onLogout={handleLogout} />
      ) : (
        // Kapag FALSE, ipakita ang Login (at ipasa ang login function)
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;