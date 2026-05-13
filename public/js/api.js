// api.js - shared fetch helper with auth attachment and optional token refresh retry

const Api = (() => {
    async function request(url, options = {}) {
        const {
            method = 'GET',
            body,
            headers = {},
            auth = true,
            credentials = 'include',
            retryOnUnauthorized = true,
            parseJson = true,
            cache,
            signal,
        } = options;

        const finalHeaders = { ...headers };

        if (auth) {
            const session = await window.Auth?.getSession?.();
            if (!session || !session.token) {
                throw new Error('Not authenticated.');
            }
            Object.assign(finalHeaders, window.Auth.authHeader(session.token));
        }

        let payload = body;
        if (body !== undefined && body !== null) {
            const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
            const isString = typeof body === 'string';

            if (!isFormData && !isString) {
                if (!finalHeaders['Content-Type']) {
                    finalHeaders['Content-Type'] = 'application/json';
                }
                payload = JSON.stringify(body);
            }
        }

        const res = await fetch(url, {
            method,
            headers: finalHeaders,
            credentials,
            body: payload,
            cache,
            signal,
        });

        if (res.status === 401 && auth && retryOnUnauthorized && window.Auth?.refreshToken) {
            try {
                await window.Auth.refreshToken();
                return request(url, { ...options, retryOnUnauthorized: false });
            } catch (_) {
                // Let the normal error path run below.
            }
        }

        let data = null;
        if (parseJson) {
            const text = await res.text();
            data = text ? JSON.parse(text) : {};
        }

        if (!res.ok) {
            const message = data && data.error ? data.error : `HTTP ${res.status}`;
            const err = new Error(message);
            err.status = res.status;
            err.data = data;
            throw err;
        }

        return parseJson ? data : res;
    }

    return { request };
})();

window.Api = Api;