import Cookies from 'js-cookie';
import CommonStore from '@/stores/common-store';
import { TAuthData } from '@/types/api-types';
import { clearAuthData } from '@/utils/auth-utils';
import { observer as globalObserver } from '../../utils/observer';
import { doUntilDone, socket_state } from '../tradeEngine/utils/helpers';
import {
    CONNECTION_STATUS,
    setAccountList,
    setAuthData,
    setConnectionStatus,
    setIsAuthorized,
    setIsAuthorizing,
} from './observables/connection-status-stream';
import ApiHelpers from './api-helpers';
import { generateDerivApiInstance, V2GetActiveClientId, V2GetActiveToken } from './appId';
import chart_api from './chart-api';

type CurrentSubscription = {
    id: string;
    unsubscribe: () => void;
};

type SubscriptionPromise = Promise<{
    subscription: CurrentSubscription;
}>;

type TApiBaseApi = {
    connection: {
        readyState: keyof typeof socket_state;
        addEventListener: (event: string, callback: () => void) => void;
        removeEventListener: (event: string, callback: () => void) => void;
    };
    send: (data: unknown) => void;
    disconnect: () => void;
    authorize: (token: string) => Promise<{ authorize: TAuthData; error: unknown }>;
    getSelfExclusion: () => Promise<unknown>;
    onMessage: () => {
        subscribe: (callback: (message: unknown) => void) => {
            unsubscribe: () => void;
        };
    };
} & ReturnType<typeof generateDerivApiInstance>;

class APIBase {
    api: TApiBaseApi | null = null;
    token: string = '';
    account_id: string = '';
    pip_sizes = {};
    account_info = {};
    is_running = false;
    subscriptions: CurrentSubscription[] = [];
    time_interval: ReturnType<typeof setInterval> | null = null;
    has_active_symbols = false;
    is_stopping = false;
    active_symbols = [];
    current_auth_subscriptions: SubscriptionPromise[] = [];
    is_authorized = false;
    active_symbols_promise: Promise<void> | null = null;
    common_store: CommonStore | undefined;
    landing_company: string | null = null;
    reconnect_attempts = 0;
    max_reconnect_attempts = 5;
    reconnect_timeout: ReturnType<typeof setTimeout> | null = null;
    ping_interval: ReturnType<typeof setInterval> | null = null;

    unsubscribeAllSubscriptions = () => {
        this.current_auth_subscriptions?.forEach(subscription_promise => {
            subscription_promise.then(({ subscription }) => {
                if (subscription?.id) {
                    this.api?.send({
                        forget: subscription.id,
                    });
                }
            });
        });
        this.current_auth_subscriptions = [];
    };

    onsocketopen() {
        setConnectionStatus(CONNECTION_STATUS.OPENED);
        this.common_store?.setSocketOpened(true);
        this.reconnect_attempts = 0; // Reset on success
        if (this.reconnect_timeout) {
            clearTimeout(this.reconnect_timeout);
            this.reconnect_timeout = null;
        }
    }

    onsocketclose() {
        setConnectionStatus(CONNECTION_STATUS.CLOSED);
        this.common_store?.setSocketOpened(false);
        this.reconnectIfNotConnected();
    }

    async init(force_create_connection = false) {
        this.toggleRunButton(true);

        if (this.api) {
            this.unsubscribeAllSubscriptions();
        }

        if (!this.api || this.api?.connection.readyState !== 1 || force_create_connection) {
            if (this.api?.connection) {
                ApiHelpers.disposeInstance();
                setConnectionStatus(CONNECTION_STATUS.CLOSED);
                this.api.disconnect();
                this.api.connection.removeEventListener('open', this.onsocketopen.bind(this));
                this.api.connection.removeEventListener('close', this.onsocketclose.bind(this));
            }

            this.api = generateDerivApiInstance();
            this.api?.connection.addEventListener('open', this.onsocketopen.bind(this));
            this.api?.connection.addEventListener('close', this.onsocketclose.bind(this));

            // DEBUG: Add direct event listeners to debug connection stability
            if (this.api?.connection) {
                // connection listeners removed for performance
            }
        }

        if (!this.has_active_symbols && !V2GetActiveToken()) {
            this.active_symbols_promise = this.getActiveSymbols();
        }

        this.initEventListeners();

        if (this.time_interval) clearInterval(this.time_interval);
        this.time_interval = null;

        if (V2GetActiveToken()) {
            setIsAuthorizing(true);
            await this.authorizeAndSubscribe();
        }

        this.startPingLoop();
        chart_api.init(force_create_connection);
    }

    getConnectionStatus() {
        if (this.api?.connection) {
            const ready_state = this.api.connection.readyState;
            return socket_state[ready_state as keyof typeof socket_state] || 'Unknown';
        }
        return 'Socket not initialized';
    }

    terminate() {
        // eslint-disable-next-line no-console
        if (this.api) {
            this.api.disconnect();
        }
    }

    initEventListeners() {
        if (window) {
            window.addEventListener('online', this.reconnectIfNotConnected);
            window.addEventListener('focus', this.reconnectIfNotConnected);
        }
    }

    async createNewInstance(account_id: string) {
        if (this.account_id !== account_id) {
            await this.init();
        }
    }

    reconnectIfNotConnected = () => {
        if (this.reconnect_timeout) return;

        const readyState = this.api?.connection?.readyState;

        if (readyState !== undefined && readyState > 1) {
            if (this.reconnect_attempts >= this.max_reconnect_attempts) {
                console.error('[API] Max reconnect attempts reached. Stopping reconnection.');
                return;
            }

            const delay = Math.min(1000 * Math.pow(2, this.reconnect_attempts), 10000);
            this.reconnect_attempts++;

            this.reconnect_timeout = setTimeout(() => {
                this.reconnect_timeout = null;
                this.init(true);
            }, delay);
        }
    };

    async authorizeAndSubscribe() {
        const token = V2GetActiveToken();
        if (!this.api) return;

        if (!token) {
            console.log('[API] No token found, proceeding anonymously');
            if (!this.has_active_symbols) {
                this.active_symbols_promise = this.getActiveSymbols();
            }
            this.subscribe();
            return;
        }

        this.token = token;
        this.account_id = V2GetActiveClientId() ?? '';

        setIsAuthorizing(true);
        setIsAuthorized(false);

        try {
            console.log('[API] Starting authorization process...');
            const authPromise = this.api.authorize(this.token);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Auth Timeout')), 15000)
            );

            const { authorize, error } = (await Promise.race([authPromise, timeoutPromise])) as {
                authorize: TAuthData;
                error: any;
            };

            if (error) {
                console.error('[API] Authorization Error Response:', error);
                if (error.code === 'InvalidToken') {
                    const is_tmb_enabled = window.is_tmb_enabled === true;
                    if (Cookies.get('logged_state') === 'true' && !is_tmb_enabled) {
                        globalObserver.emit('InvalidToken', { error });
                    } else {
                        console.warn('[API] Clearing auth data due to InvalidToken');
                        clearAuthData();
                    }
                } else {
                    console.error('[API] Authorization error (generic):', error);
                }
                setIsAuthorizing(false);
                return error;
            }
            this.account_info = authorize;
            setAccountList(authorize?.account_list || []);
            setAuthData(authorize);
            setIsAuthorized(true);
            this.is_authorized = true;
            localStorage.setItem('client_account_details', JSON.stringify(authorize?.account_list));
            localStorage.setItem('client.country', authorize?.country);

            // Cache balance immediately for faster subsequent loads
            if (authorize.balance !== undefined) {
                try {
                    const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
                    if (clientAccounts[this.account_id]) {
                        clientAccounts[this.account_id].balance = authorize.balance;
                        clientAccounts[this.account_id].currency = authorize.currency;
                        localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
                    }
                } catch (e) {
                    console.error('[API] Failed to cache balance:', e);
                }
            }

            if (this.has_active_symbols) {
                this.toggleRunButton(false);
            } else {
                this.active_symbols_promise = this.getActiveSymbols();
            }
            this.subscribe();
            // this.getSelfExclusion(); commented this so we dont call it from two places
        } catch (e: any) {
            console.error('[API] Authorization Exception:', e);
            this.is_authorized = false;
            // Only clear auth data if it's a real failure, not just a timeout during initialization
            // but for now, we follow the existing logic of clearing if fails.
            if (e?.message !== 'Auth Timeout') {
                clearAuthData();
            }
            setIsAuthorized(false);
            globalObserver.emit('Error', e);
        } finally {
            setIsAuthorizing(false);
            this.toggleRunButton(false);
        }
    }

    async getSelfExclusion() {
        if (!this.api || !this.is_authorized) return;
        await this.api.getSelfExclusion();
        // TODO: fix self exclusion
    }

    async subscribe() {
        const subscribeToStream = (streamName: string) => {
            return doUntilDone(
                () => {
                    const subscription = this.api?.send({
                        [streamName]: 1,
                        subscribe: 1,
                        ...(streamName === 'balance' ? { account: 'all' } : {}),
                    });
                    if (subscription) {
                        this.current_auth_subscriptions.push(subscription);
                    }
                    return subscription;
                },
                [],
                this
            );
        };

        const streamsToSubscribe = ['balance', 'transaction', 'proposal_open_contract'];

        await Promise.all(streamsToSubscribe.map(subscribeToStream));
    }

    getActiveSymbols = async () => {
        await doUntilDone(() => this.api?.send({ active_symbols: 'brief' }), [], this).then(
            ({ active_symbols = [], error = {} }) => {
                const pip_sizes = {};
                if (active_symbols.length) this.has_active_symbols = true;
                active_symbols.forEach(({ symbol, pip }: { symbol: string; pip: string }) => {
                    (pip_sizes as Record<string, number>)[symbol] = +(+pip).toExponential().substring(3);
                });
                this.pip_sizes = pip_sizes as Record<string, number>;
                this.toggleRunButton(false);
                this.active_symbols = active_symbols;
                return active_symbols || error;
            }
        );
    };

    toggleRunButton = (toggle: boolean) => {
        const run_button = document.querySelector('#db-animation__run-button');
        if (!run_button) return;
        (run_button as HTMLButtonElement).disabled = toggle;
    };

    setIsRunning(toggle = false) {
        this.is_running = toggle;
    }

    pushSubscription(subscription: CurrentSubscription) {
        this.subscriptions.push(subscription);
    }

    clearSubscriptions() {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];

        if (this.ping_interval) {
            clearInterval(this.ping_interval);
            this.ping_interval = null;
        }

        // Resetting timeout resolvers
        const global_timeouts = globalObserver.getState('global_timeouts') ?? [];

        global_timeouts.forEach((_: unknown, i: number) => {
            clearTimeout(i);
        });
    }

    startPingLoop() {
        if (this.ping_interval) clearInterval(this.ping_interval);
        this.ping_interval = setInterval(() => this.measureLatency(), 5000); // Every 5 seconds
    }

    async measureLatency() {
        if (!this.api || this.api.connection.readyState !== 1) return;
        const start = Date.now();
        try {
            await this.api.send({ ping: 1 });
            const latency = Date.now() - start;
            if (this.common_store) {
                this.common_store.setLatency(latency);
            }
        } catch (e) {
            console.error('Ping error:', e);
        }
    }
}

export const api_base = new APIBase();
