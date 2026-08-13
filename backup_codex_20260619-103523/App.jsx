import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ProfessionalDashboard from "./ProfessionalDashboard";
import LoginPage from "./LoginPage";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('authUser') || 'Admin');

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated ? 
            <Navigate to="/" replace /> : 
            <LoginPage onLoginSuccess={(_, username) => {
              setCurrentUser(username || 'Admin');
              setIsAuthenticated(true);
            }} />
          } 
        />
        <Route 
          path="/*" 
          element={
            isAuthenticated ? 
            <ProfessionalDashboard currentUser={currentUser} onLogout={() => {
              localStorage.removeItem('authToken');
              localStorage.removeItem('authUser');
              setIsAuthenticated(false);
            }} /> : 
            <Navigate to="/login" replace />
          } 
        />
      </Routes>
    </Router>
  );
}
