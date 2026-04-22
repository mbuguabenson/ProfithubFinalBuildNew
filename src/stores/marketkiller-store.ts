import { action, makeObservable, observable, runInAction } from 'mobx';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { DigitStatsEngine } from '@/lib/digit-stats-engine';
import RootStore from './root-store';

type TMarketkillerSubtab = 'onetrader' | 'matches';

export type TRecoveryStep = {
    id: string;
    symbol: string;
    contract_type: string;
    stake_multiplier: number;
    barrier?: number;
};

export type TMarketState = {
    symbol: string;
    price: string | number;
    digit: number | null;
    is_up: boolean;
};

export default class MarketkillerStore {
    root_store: RootStore;
    stats_engine: DigitStatsEngine;

    @observable accessor active_subtab: TMarketkillerSubtab = 'onetrader';
    @observable accessor is_connected = false;
    @observable accessor active_symbols: any[] = [];
    @observable accessor symbol = 'R_100';
    @observable accessor current_price: string | number = 0;
    @observable accessor last_digit: number | null = null;
    @observable accessor ticks: number[] = [];
    @observable accessor live_market_ribbon: TMarketState[] = [];

    // Digit Analytics (0-9)
    @observable accessor digit_stats: { digit: number; count: number; percentage: number }[] = Array.from(
        { length: 10 },
        (_, i) => ({ digit: i, count: 0, percentage: 0 })
    );
    @observable accessor digit_power_scores: number[] = Array(10).fill(0);

    // Global Execution State
    @observable accessor is_running = false;
    @observable accessor session_pl = 0;
    @observable accessor wins = 0;
    @observable accessor losses = 0;
    @observable accessor consecutive_losses = 0;

    // Signal Data
    @observable accessor signal_power = 0;
    @observable accessor signal_stability = 0;
    @observable accessor signal_strategy = 'OVER_4';
    @observable accessor use_signals = false;
    @observable accessor entry_point_enabled = false;

    // --- ONETRADER (HEDGING) SETTINGS ---
    @observable accessor onetrader_settings = {
        contract_type: 'DIGITOVER',
        stake: 0.35,
        duration: 1,
        barrier: 4,
        bulk_count: 1,
        enable_recovery: false,
        recovery_chain: [
            { id: '1', symbol: 'R_100', contract_type: 'DIGITUNDER', stake_multiplier: 2, barrier: 5 },
        ] as TRecoveryStep[],
    };

    // --- MATCHES KILLER SETTINGS ---
    @observable accessor matches_settings = {
        check_ticks: 25,
        predictions: [] as number[],
        is_running: false,
        is_auto: false,
        stake: 0.35,
        martingale_enabled: false,
        martingale_multiplier: 2.1,
        simultaneous_trades: 1,
        enabled_conditions: [true, false, false, false, false, false], // C1-C6
        c4_op: '>=',
        c4_val: 12,
        c4_ticks: 25,
        c6_count: 2,
        c6_target_rank: 'most' as 'most' | '2nd' | 'least',
    };

    @observable accessor matches_ranks = {
        most: null as number | null,
        second: null as number | null,
        least: null as number | null,
    };

    private tick_subscription: any = null;
    private recent_powers: number[][] = [];
    private ribbon_subscriptions: Map<string, any> = new Map();

    constructor(root_store: RootStore) {
        makeObservable(this);
        this.root_store = root_store;
        this.stats_engine = new DigitStatsEngine();

        // Initial ribbon markets
        const initialMarkets = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V'];
        initialMarkets.forEach(sym => {
            this.live_market_ribbon.push({ symbol: sym, price: '0.00', digit: null, is_up: true });
        });

        // Wait for API to be ready then connect
        this.waitForApiAndConnect();
    }

    @action
    private waitForApiAndConnect = () => {
        const tryConnect = () => {
            if (api_base.api) {
                runInAction(() => {
                    this.is_connected = true;
                });
                this.subscribeToTicks();
                this.subscribeToRibbon();
            } else {
                setTimeout(tryConnect, 1000);
            }
        };
        tryConnect();
    };

    @action
    setActiveSubtab = (tab: TMarketkillerSubtab) => {
        this.active_subtab = tab;
    };

    @action
    setSymbol = (sym: string) => {
        this.symbol = sym;
        this.subscribeToTicks();
    };

    @action
    toggleEngine = () => {
        this.is_running = !this.is_running;
        if (!this.is_running) {
            this.consecutive_losses = 0;
        }
    };

    @action
    addRecoveryStep = () => {
        const id = Math.random().toString(36).substring(2, 9);
        runInAction(() => {
            this.onetrader_settings.recovery_chain.push({
                id,
                symbol: this.symbol,
                contract_type: this.onetrader_settings.contract_type === 'DIGITOVER' ? 'DIGITUNDER' : 'DIGITOVER',
                stake_multiplier: 2,
                barrier: this.onetrader_settings.barrier,
            });
        });
    };

    @action
    removeRecoveryStep = (id: string) => {
        runInAction(() => {
            this.onetrader_settings.recovery_chain = this.onetrader_settings.recovery_chain.filter(s => s.id !== id);
        });
    };

    @action
    public subscribeToTicks = async () => {
        if (this.tick_subscription) {
            try {
                api_base.api.forget(this.tick_subscription.id);
            } catch (e) {
                // ignore
            }
        }

        try {
            const req = { ticks: this.symbol, subscribe: 1 };
            const response = await api_base.api.send(req);

            this.tick_subscription = response.subscription;

            // Simple event listener hook for tick tracking
            api_base.api.onMessage().subscribe((res: any) => {
                if (res.data.msg_type === 'tick' && res.data.tick.symbol === this.symbol) {
                    this.onTickArrival(res.data.tick);
                }
            });
        } catch (error) {
            console.error('Marketkiller tick sub error:', error);
        }
    };

    @action
    private subscribeToRibbon = async () => {
        this.live_market_ribbon.forEach(async m => {
            try {
                const response = await api_base.api.send({ ticks: m.symbol, subscribe: 1 });
                if (response.subscription) {
                    this.ribbon_subscriptions.set(m.symbol, response.subscription.id);
                }
            } catch (e) {
                // ignore
            }
        });

        api_base.api.onMessage().subscribe((res: any) => {
            if (res.data.msg_type === 'tick') {
                const tick = res.data.tick;
                const index = this.live_market_ribbon.findIndex(m => m.symbol === tick.symbol);
                if (index !== -1) {
                    runInAction(() => {
                        const m = this.live_market_ribbon[index];
                        const price = parseFloat(tick.quote).toFixed(tick.pip_size || 2);
                        m.is_up = parseFloat(price) >= parseFloat(String(m.price));
                        m.price = price;
                        m.digit = parseInt(price.slice(-1));
                    });
                }
            }
        });
    };

    @action
    private onTickArrival = (tick: any) => {
        const price = parseFloat(tick.quote).toFixed(tick.pip_size || 2);
        const last_digit = parseInt(price.slice(-1));

        runInAction(() => {
            this.current_price = price;
            this.last_digit = last_digit;
            this.ticks = [...this.ticks, last_digit].slice(-120);

            // Feed DigitStatsEngine
            this.stats_engine.updateWithHistory(this.ticks, parseFloat(String(this.current_price)));

            this.updateDigitAnalytics();

            if (this.is_running) {
                this.evaluateLogicEngine();
            }
        });
    };

    @action
    private updateDigitAnalytics = () => {
        const stats = this.stats_engine.digit_stats;
        if (stats.length === 0) return;

        this.digit_stats = stats.map(s => ({
            digit: s.digit,
            count: s.count,
            percentage: s.percentage,
        }));

        this.digit_power_scores = stats.map(s => s.power);

        // Update global Signal state
        const percentages = this.stats_engine.getPercentages();
        switch (this.signal_strategy) {
            case 'EVEN':
                this.signal_power = percentages.even;
                break;
            case 'ODD':
                this.signal_power = percentages.odd;
                break;
            case 'RISE':
                this.signal_power = percentages.rise;
                break;
            case 'FALL':
                this.signal_power = percentages.fall;
                break;
            case 'OVER_4':
                this.signal_power = percentages.over;
                break;
            case 'UNDER_5':
                this.signal_power = percentages.under;
                break;
        }

        this.signal_stability = Math.max(20, 100 - Math.abs(50 - this.signal_power) / 2);

        // Calculate Special Ranks for Matches
        if (this.digit_stats.length >= 10) {
            const sorted = [...this.digit_stats].sort((a, b) => b.count - a.count);
            this.matches_ranks = {
                most: sorted[0].digit,
                second: sorted[1].digit,
                least: sorted[9].digit,
            };
        }
    };

    @action
    private evaluateLogicEngine = () => {
        if (this.active_subtab === 'onetrader') {
            this.evaluateOnetrader();
        } else if (this.active_subtab === 'matches') {
            this.evaluateMatchesKiller();
        }
    };

    @action
    private evaluateOnetrader = () => {
        // Recovery Engine Overrides
        let current_symbol = this.symbol;
        let current_type = this.onetrader_settings.contract_type;
        let current_stake = this.onetrader_settings.stake;
        let current_barrier = this.onetrader_settings.barrier;

        const is_recovery_step = this.onetrader_settings.enable_recovery && this.consecutive_losses > 0;

        if (is_recovery_step) {
            const step_index = Math.min(this.consecutive_losses - 1, this.onetrader_settings.recovery_chain.length - 1);
            const step = this.onetrader_settings.recovery_chain[step_index];
            if (step) {
                current_symbol = step.symbol;
                current_type = step.contract_type;
                current_stake *= step.stake_multiplier;
                current_barrier = step.barrier ?? current_barrier;
            }
        }

        // Logic check: if using signals, only trade if power > 55
        if (this.use_signals && !is_recovery_step) {
            if (this.signal_power < 55) return; // Wait for better signal
        }

        const tradesToExecute = Array(this.onetrader_settings.bulk_count).fill({
            type: current_type,
            symbol: current_symbol,
            barrier: current_barrier,
            stake: current_stake,
        });

        this.executeConcurrentTrades(tradesToExecute);
        // Halt to prevent rapid-fire while evaluating execution resolution
        this.is_running = false;
    };

    @action
    private evaluateMatchesKiller = () => {
        const most = this.matches_ranks.most;
        const second = this.matches_ranks.second;
        const least = this.matches_ranks.least;

        const enabled = this.matches_settings.enabled_conditions;
        let final_targets: number[] = [...this.matches_settings.predictions];

        // C5: Force Trio-Sync (Most, 2nd, Least)
        if (enabled[4]) {
            final_targets = [most, second, least].filter(d => d !== null) as number[];
        }

        if (final_targets.length === 0) return;

        const shouldTradeDigit = (digit: number) => {
            const stat = this.digit_stats.find(s => s.digit === digit);
            if (!stat) return false;

            // C2: Momentum
            if (enabled[1] && this.digit_power_scores[digit] <= 0) return false;

            // C3: Double Increase
            if (enabled[2] && this.recent_powers.length >= 3) {
                const len = this.recent_powers.length;
                const p1 = this.recent_powers[len - 3][digit];
                const p2 = this.recent_powers[len - 2][digit];
                const p3 = this.recent_powers[len - 1][digit];
                if (!(p3 > p2 && p2 > p1)) return false;
            }

            // C4: Power Threshold
            if (enabled[3]) {
                const { c4_op: op, c4_val: val } = this.matches_settings;
                const power = stat.percentage;
                if (op === '>' && power <= val) return false;
                if (op === '>=' && power < val) return false;
                if (op === '==' && Math.abs(power - val) > 0.1) return false;
                if (op === '<' && power >= val) return false;
                if (op === '<=' && power > val) return false;
            }

            return true;
        };

        const valid_targets = final_targets.filter(shouldTradeDigit);

        if (valid_targets.length > 0) {
            const trade_count = this.matches_settings.simultaneous_trades || 1;
            const capped_targets = valid_targets.slice(0, trade_count);

            const trades = capped_targets.map(digit => ({
                type: 'DIGITMATCH',
                symbol: this.symbol,
                barrier: digit,
                stake: this.calculateMatchesStake(),
            }));

            this.executeConcurrentTrades(trades);
            this.is_running = false;
        }
    };

    private calculateMatchesStake = () => {
        let stake = this.matches_settings.stake || 0.35;
        if (this.matches_settings.martingale_enabled && this.consecutive_losses > 0) {
            stake = stake * Math.pow(this.matches_settings.martingale_multiplier, this.consecutive_losses);
        }
        return Number(stake.toFixed(2));
    };

    @action
    private executeConcurrentTrades = async (tradeConfigs: any[]) => {
        try {
            // Ensure auth
            const auth_status = await api_base.api.send({ balance: 1 });
            if (!auth_status) return;

            const trades = await Promise.all(
                tradeConfigs.map(async config => {
                    const proposalReq = {
                        proposal: 1,
                        amount: config.stake,
                        basis: 'stake',
                        contract_type: config.type,
                        currency: 'USD',
                        duration: this.onetrader_settings.duration,
                        duration_unit: 't',
                        symbol: config.symbol,
                        barrier: config.barrier?.toString(),
                    };

                    const propResponse = await api_base.api.send(proposalReq);
                    if (propResponse.error) throw propResponse.error;

                    const buyReq = {
                        buy: propResponse.proposal.id,
                        price: propResponse.proposal.ask_price,
                    };

                    return api_base.api.send(buyReq);
                })
            );

            // Track outcomes
            trades.forEach((trade: any) => {
                // Pseudo-hook: Wait for contract completion (Omitted complex subscription for brevity, normally uses proposal_open_contract)
                // Assume win/loss based on standard response format over WS hook
                api_base.api.onMessage().subscribe((res: any) => {
                    if (
                        res.data.msg_type === 'proposal_open_contract' &&
                        res.data.proposal_open_contract.contract_id === trade.buy.contract_id &&
                        res.data.proposal_open_contract.is_sold
                    ) {
                        const isWin = res.data.proposal_open_contract.status === 'won';
                        const profit = res.data.proposal_open_contract.profit;
                        runInAction(() => {
                            if (isWin) {
                                this.wins++;
                                this.consecutive_losses = 0;
                            } else {
                                this.losses++;
                                this.consecutive_losses++;
                            }
                            this.session_pl += profit;

                            // Re-trigger if multiple bulk loop desires (Restart engine condition here if wanted, left manual for safety)
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Marketkiller Trade execution failed:', error);
        }
    };
}
