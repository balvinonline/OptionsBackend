import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setApiBaseUrl } from '../services/api';
import { clearStoredAuth, getDefaultServerUrl, getStoredAuth, getStoredServerUrl, setStoredAuth, setStoredServerUrl } from '../services/storage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentUser, setCurrentUser] = useState('Admin');
  const [serverUrl, setServerUrlState] = useState(getDefaultServerUrl());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedUrl = await getStoredServerUrl();
        if (storedUrl) {
          setServerUrlState(storedUrl);
          setApiBaseUrl(storedUrl);
        }

        const { token, user } = await getStoredAuth();
        if (user) {
          setCurrentUser(user);
        }
        setIsAuthenticated(true);
      } catch (e) {
        console.error('Init Auth error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const res = await api.login(username, password);
      if (res && res.success && res.token) {
        await setStoredAuth(res.token, username);
        setIsAuthenticated(true);
        setCurrentUser(username);
        return { success: true };
      }
      return { success: false, message: res?.message || 'Invalid credentials' };
    } catch (e) {
      return { 
        success: false, 
        message: e.response?.data?.message || e.message || 'Cannot reach server. Check IP & port.' 
      };
    }
  };

  const logout = async () => {
    await clearStoredAuth();
    setIsAuthenticated(false);
    setCurrentUser('Admin');
  };

  const updateServerUrl = async (newUrl) => {
    const clean = await setStoredServerUrl(newUrl);
    setServerUrlState(clean);
    setApiBaseUrl(clean);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        setIsAuthenticated,
        currentUser,
        serverUrl,
        isLoading,
        login,
        logout,
        updateServerUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
