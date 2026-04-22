import { useEffect, useRef } from 'react';
import Cookies from 'js-cookie';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';

import { clearAuthData } from '@/utils/auth-utils';
import { useStore } from '@/hooks/useStore';
import { observer } from 'mobx-react-lite';

const CallbackPage = observer(() => {
    const { common } = useStore();
    const isProcessing = useRef(false);

    useEffect(() => {
        const processUrlTokens = async () => {
            if (isProcessing.current) return;
            isProcessing.current = true;

            // Clear potential legacy config that causes InvalidToken errors on Vercel
            if (window.location.hostname.endsWith('.vercel.app')) {
                localStorage.removeItem('config.app_id');
                localStorage.removeItem('config.server_url');
            }

            const params = new URLSearchParams(window.location.search);
            const tokens: Record<string, string> = {};
            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {};

            // Extract all params to a dictionary first
            for (const [key, value] of params.entries()) {
                tokens[key] = value;
            }

            // Parse accounts (acct1, token1, cur1, etc.)
            for (const [key, value] of Object.entries(tokens)) {
                if (key.startsWith('acct')) {
                    const index = key.replace('acct', '');
                    const tokenKey = `token${index}`;
                    const curKey = `cur${index}`;
                    const token = tokens[tokenKey];
                    const currency = tokens[curKey] || '';

                    if (token) {
                        accountsList[value] = token;
                        clientAccounts[value] = {
                            loginid: value,
                            token: token,
                            currency: currency,
                        };
                    }
                }
            }

            if (Object.keys(accountsList).length === 0) {
                console.error('No accounts found in callback URL');
                common.setError(true, {
                    message: 'Login failed: No accounts found.',
                    header: 'Login Error',
                });
                return;
            }

            // 1. Save minimal auth data needed for API
            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));

            // Default to the first account (acct1) as active
            const firstToken = tokens['token1'];
            const firstAcct = tokens['acct1'];

            if (firstToken && firstAcct) {
                localStorage.setItem('authToken', firstToken);
                localStorage.setItem('active_loginid', firstAcct);
                Cookies.set('logged_state', 'true', { expires: 30, path: '/' });
            } else {
                // Fallback if acct1 is missing (rare but possible)
                const firstKey = Object.keys(accountsList)[0];
                if (firstKey) {
                    localStorage.setItem('authToken', accountsList[firstKey]);
                    localStorage.setItem('active_loginid', firstKey);
                    Cookies.set('logged_state', 'true', { expires: 30, path: '/' });
                }
            }

            // 2. Authorize to validate and get details
            try {
                const api = generateDerivApiInstance();
                const activeToken = localStorage.getItem('authToken');

                if (api && activeToken) {
                    const { authorize, error } = await api.authorize(activeToken);

                    if (error) {
                        console.error('Authorization error in callback:', error);
                        if (error.code === 'InvalidToken') {
                            clearAuthData();
                            console.error('Login failed with error:', error);
                            common.setError(true, {
                                message: `Login failed: ${error.message || error.code || 'Invalid token'}`,
                                header: 'Login Error',
                            });
                            return;
                        }
                    } else {
                        // Success - update local storage with authoritative data from API
                        if (authorize.account_list) {
                            localStorage.setItem('client_account_details', JSON.stringify(authorize.account_list));
                        }
                        if (authorize.country) {
                            localStorage.setItem('client.country', authorize.country);
                        }
                    }
                    api.disconnect();
                }
            } catch (e) {
                console.error('API Error during callback processing:', e);
            }

            // 3. Redirect to dashboard
            // Preserve the 'account' query param if user wanted a specific currency, else default to 'USD' or the first account's currency
            // But usually just redirecting to / is enough, main.tsx handles default account selection.
            window.location.assign(window.location.origin);
        };

        processUrlTokens();
    }, [common]);

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                flexDirection: 'column',
                gap: '20px',
                color: 'var(--text-general)',
            }}
        >
            <h2>Logging in...</h2>
            <div className='initial-loader__barspinner barspinner barspinner-light'></div>
        </div>
    );
});

export default CallbackPage;
