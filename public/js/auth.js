// auth.js - Login / Register / Logout / Profile (uses window.db)

const Auth = (() => {
    const API = '/api/auth';
    const USER_API = '/api/user';

    async function register(name, email, password, upiId) {
        const data = await Api.request(`${API}/register`, {
            method: 'POST',
            auth: false,
            body: { name, email, password, upiId },
        });
        await _saveSession(data);
        return data;
    }

    async function login(email, password) {
        const data = await Api.request(`${API}/login`, {
            method: 'POST',
            auth: false,
            body: { email, password },
        });
        await _saveSession(data);
        return data;
    }

    async function refreshToken() {
        try {
            const data = await Api.request(`${API}/refresh`, {
                method: 'POST',
                auth: false,
            });
            await _saveSession(data);
            return data;
        } catch (err) {
            // Refresh failed — force logout
            await _clearSession();
            throw err;
        }
    }

    async function logout() {
        try {
            await Api.request(`${API}/logout`, {
                method: 'POST',
                auth: false,
            });
        } catch (e) {
            // Server logout failed — still clear locally
        }
        await _clearSession();
    }

    async function updateProfile(name, phone) {
        const session = await getSession();
        if (!session) throw new Error('Not authenticated.');
        const data = await Api.request(`${USER_API}/profile`, {
            method: 'PUT',
            body: { name, phone },
        });
        // Update local session
        const s = await getSession();
        s.user = data;
        await window.db.session.put(s);
        return data;
    }

    async function updateUpiId(upiId) {
        const session = await getSession();
        if (!session) throw new Error('Not authenticated.');
        const data = await Api.request(`${USER_API}/upi-id`, {
            method: 'PUT',
            body: { upiId },
        });
        const s = await getSession();
        s.user = data;
        await window.db.session.put(s);
        return data;
    }

    // --- Password helpers ---
    function checkPasswordStrength(password) {
        if (!password) return { score: 0, label: '', cls: '' };
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        if (password.length >= 12) score++;

        if (score <= 1) return { score, label: 'Weak', cls: 'weak' };
        if (score <= 2) return { score, label: 'Fair', cls: 'fair' };
        if (score <= 3) return { score, label: 'Good', cls: 'good' };
        return { score, label: 'Strong', cls: 'strong' };
    }

    // --- Session helpers ---
    async function _saveSession({ token, user }) {
        await window.db.session.put({ id: 'current', token, user });
    }

    async function _clearSession() {
        await window.db.session.delete('current');
    }

    async function getSession() {
        return window.db.session.get('current');
    }

    function authHeader(token) {
        return { Authorization: `Bearer ${token}` };
    }

    // --- Auto-refresh setup ---
    let refreshTimer = null;

    function startAutoRefresh() {
        stopAutoRefresh();
        // Refresh token every 13 minutes (access token expires in 15 min)
        refreshTimer = setInterval(async () => {
            try {
                await refreshToken();
            } catch (e) {
                // Token refresh failed — will redirect to login
                stopAutoRefresh();
            }
        }, 13 * 60 * 1000);
    }

    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    return {
        register, login, logout, refreshToken,
        getSession, authHeader, checkPasswordStrength,
        updateProfile, updateUpiId,
        startAutoRefresh, stopAutoRefresh,
    };
})();

window.Auth = Auth;
