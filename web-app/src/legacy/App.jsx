import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ProfessionalDashboard from "./ProfessionalDashboard";
import LoginPage from "./LoginPage";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', fontFamily: 'monospace', background: '#fff', height: '100vh', overflow: 'auto' }}>
          <h2>App Crashed!</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            <summary>Click to view Error</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children; 
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('authToken')));
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('authUser') || 'Admin');

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
