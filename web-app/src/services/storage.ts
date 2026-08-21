// Mock local storage for web

export const getStoredAuth = () => {
    if (typeof window !== 'undefined') {
        const auth = localStorage.getItem('auth');
        if (auth) return JSON.parse(auth);
    }
    return {};
};

export const getDefaultServerUrl = () => {
    return 'http://localhost:5000';
};

export const getStoredServerUrl = () => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('serverUrl');
    }
    return null;
};

export const normalizeServerUrl = (url: string) => {
    if (!url) return '';
    return url.replace(/\/$/, '');
};
