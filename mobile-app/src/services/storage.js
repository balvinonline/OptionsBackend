import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const KEYS = {
  SERVER_URL: 'OPTION_DESK_SERVER_URL',
  AUTH_TOKEN: 'OPTION_DESK_AUTH_TOKEN',
  AUTH_USER: 'OPTION_DESK_AUTH_USER',
  SOUND_ENABLED: 'OPTION_DESK_SOUND_ENABLED',
  HAPTIC_ENABLED: 'OPTION_DESK_HAPTIC_ENABLED',
};

export const CLOUD_SERVER_URL = 'http://192.168.0.193:5000';

// Default server URL - defaults to your 24/7 Render Cloud Server
export const getDefaultServerUrl = () => {
  return CLOUD_SERVER_URL;
};

export const getStoredServerUrl = async () => {
  try {
    const url = await AsyncStorage.getItem(KEYS.SERVER_URL);
    return url || getDefaultServerUrl();
  } catch {
    return getDefaultServerUrl();
  }
};

export const setStoredServerUrl = async (url) => {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem(KEYS.SERVER_URL, clean);
    return clean;
  } catch (e) {
    console.error('Failed to store server url', e);
  }
};

export const getStoredAuth = async () => {
  try {
    const token = await AsyncStorage.getItem(KEYS.AUTH_TOKEN);
    const user = await AsyncStorage.getItem(KEYS.AUTH_USER);
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
};

export const setStoredAuth = async (token, user) => {
  try {
    if (token) await AsyncStorage.setItem(KEYS.AUTH_TOKEN, token);
    else await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);

    if (user) await AsyncStorage.setItem(KEYS.AUTH_USER, user);
    else await AsyncStorage.removeItem(KEYS.AUTH_USER);
  } catch (e) {
    console.error('Failed to store auth', e);
  }
};

export const clearStoredAuth = async () => {
  try {
    await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
    await AsyncStorage.removeItem(KEYS.AUTH_USER);
  } catch (e) {
    console.error('Failed to clear auth', e);
  }
};

export const getStoredSettings = async () => {
  try {
    const sound = await AsyncStorage.getItem(KEYS.SOUND_ENABLED);
    const haptic = await AsyncStorage.getItem(KEYS.HAPTIC_ENABLED);
    return {
      soundEnabled: sound !== 'false',
      hapticEnabled: haptic !== 'false',
    };
  } catch {
    return { soundEnabled: true, hapticEnabled: true };
  }
};

export const setStoredSetting = async (key, val) => {
  try {
    await AsyncStorage.setItem(key === 'sound' ? KEYS.SOUND_ENABLED : KEYS.HAPTIC_ENABLED, String(val));
  } catch (e) {
    console.error('Failed to store setting', e);
  }
};
