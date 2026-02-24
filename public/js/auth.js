// auth.js - Login / Register / Logout (uses window.db)

const Auth = (() => {
    const API = '/api/auth';

    async function register(name, email, password) {
        const res = await fetch(`${API}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed.');
        await _saveSession(data);
        return data;
    }

    async function login(email, password) {
        const res = await fetch(`${API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed.');
        await _saveSession(data);
        return data;
    }

    async function _saveSession({ token, user }) {
        await window.db.session.put({ id: 'current', token, user });
    }

    async function getSession() {
        return window.db.session.get('current');
    }

    async function logout() {
        await window.db.session.delete('current');
    }

    function authHeader(token) {
        return { Authorization: `Bearer ${token}` };
    }

    return { register, login, logout, getSession, authHeader };
})();

window.Auth = Auth;
