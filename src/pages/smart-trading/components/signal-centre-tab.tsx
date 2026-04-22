import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './signal-centre-tab.scss';

/* ─────────────────────── CONSTANTS ─────────────────────── */

const CONTINUOUS_INDICES = [
    { symbol: 'R_10', label: 'Volatility 10 Index' },
    { symbol: 'R_25', label: 'Volatility 25 Index' },
    { symbol: 'R_50', label: 'Volatility 50 Index' },
    { symbol: 'R_75', label: 'Volatility 75 Index' },
    { symbol: 'R_100', label: 'Volatility 100 Index' },
    { symbol: '1HZ10V', label: 'Volatility 10 (1s)' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s)' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s)' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s)' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s)' },
];

const TRADE_TYPES = [
    { id: 'EVENODD', label: 'Even / Odd', icon: '⚖️', color: '#6366f1' },
    { id: 'OVERUNDER', label: 'Over / Under', icon: '📊', color: '#f59e0b' },
    { id: 'RISEFALL', label: 'Rise / Fall', icon: '📈', color: '#10b981' },
    { id: 'DIFFERS', label: 'Differs', icon: '🎯', color: '#ec4899' },
];

const SIGNAL_VALIDITY_SECONDS = 45;

/* ─────────────────────── ANALYSIS HELPERS ─────────────────────── */

interface MarketAnalysis {
    symbol: string;
    label: string;
    ticks: number[];
    evenPct: number;
    oddPct: number;
    overPct: number; // digits 5-9
    underPct: number; // digits 0-4
    risePct: number;
    fallPct: number;
    differsBest: number; // safest digit to differ
    matchesBest: number; // hottest digit to match
    deviation: number; // how far the dominant side is from 50 %
    confidence: number; // 0-100
    signal: string;
    entry: string;
    tradeType: string;
    prediction: number | null;
    score: number;
}

function analyseMarket(symbol: string, label: string, digits: number[], tradeType: string): MarketAnalysis {
    const last = digits.slice(-120);
    const total = last.length || 1;

    const even = last.filter(d => d % 2 === 0).length;
    const odd = total - even;
    const over = last.filter(d => d >= 5).length;
    const under = total - over;

    let rises = 0,
        falls = 0;
    for (let i = 1; i < last.length; i++) {
        if (last[i] > last[i - 1]) rises++;
        else if (last[i] < last[i - 1]) falls++;
    }
    const rf_total = rises + falls || 1;

    // Digit frequency map
    const freq: Record<number, number> = {};
    for (let d = 0; d < 10; d++) freq[d] = 0;
    last.forEach(d => {
        if (d >= 0 && d <= 9) freq[d]++;
    });

    const evenPct = (even / total) * 100;
    const oddPct = (odd / total) * 100;
    const overPct = (over / total) * 100;
    const underPct = (under / total) * 100;
    const risePct = (rises / rf_total) * 100;
    const fallPct = (falls / rf_total) * 100;

    // Hottest / coldest digit
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const matchesBest = Number(sorted[0][0]);
    const differsBest = Number(sorted[sorted.length - 1][0]);

    let deviation = 0,
        signal = 'STANDBY',
        entry = '',
        prediction: number | null = null,
        score = 0;

    switch (tradeType) {
        case 'EVENODD': {
            const dom = evenPct > oddPct ? 'EVEN' : 'ODD';
            deviation = Math.abs(evenPct - oddPct);
            score = Math.min(deviation * 3, 100);
            if (deviation >= 7) {
                signal = dom === 'EVEN' ? 'BUY EVEN' : 'BUY ODD';
                entry = dom;
            }
            break;
        }
        case 'OVERUNDER': {
            const dom = overPct > underPct ? 'OVER' : 'UNDER';
            deviation = Math.abs(overPct - underPct);
            score = Math.min(deviation * 3, 100);
            if (deviation >= 7) {
                signal = dom === 'OVER' ? 'BUY OVER' : 'BUY UNDER';
                entry = dom;
                // barrier suggestion
                prediction =
                    dom === 'OVER'
                        ? Math.min(...sorted.filter(([d]) => Number(d) >= 5).map(([d]) => Number(d)))
                        : Math.max(...sorted.filter(([d]) => Number(d) < 5).map(([d]) => Number(d)));
            }
            break;
        }
        case 'RISEFALL': {
            const dom = risePct > fallPct ? 'RISE' : 'FALL';
            deviation = Math.abs(risePct - fallPct);
            score = Math.min(deviation * 2.5, 100);
            if (deviation >= 8) {
                signal = dom === 'RISE' ? 'BUY RISE' : 'BUY FALL';
                entry = dom;
            }
            break;
        }
        case 'DIFFERS': {
            const leastFreq = sorted[sorted.length - 1][1];
            const leastDigit = Number(sorted[sorted.length - 1][0]);
            const leastPct = (leastFreq / total) * 100;
            deviation = 10 - leastPct; // how far below flat 10 %
            score = Math.min(deviation * 5, 100);
            differsBest && null;
            if (score >= 40) {
                signal = `DIFFER ${leastDigit}`;
                entry = `Avoid digit ${leastDigit}`;
                prediction = leastDigit;
            }
            break;
        }
    }

    const confidence = Math.min(score * (Math.min(total, 120) / 120), 100);

    return {
        symbol,
        label,
        ticks: last,
        evenPct,
        oddPct,
        overPct,
        underPct,
        risePct,
        fallPct,
        differsBest,
        matchesBest,
        deviation,
        confidence,
        signal: signal || 'STANDBY',
        entry,
        tradeType,
        prediction,
        score,
    };
}

/* ─────────────────────── MAIN COMPONENT ─────────────────────── */

const SignalCentreTab = observer(() => {
    const { smart_trading, common } = useStore();
    const {
        active_symbols_data,
        calculateProbabilities,
        ticks: globalTicks,
        last_digit,
        current_price,
        symbol: activeSymbol,
    } = smart_trading;

    // ── Local state ──
    const [tradeType, setTradeType] = useState<string>('EVENODD');
    const [isScanning, setIsScanning] = useState(false);
    const [scanPhase, setScanPhase] = useState<string>('STANDBY');
    const [scanningIndex, setScanningIndex] = useState(-1);
    const [marketData, setMarketData] = useState<Record<string, { ticks: number[]; price: string }>>({});
    const [analyses, setAnalyses] = useState<MarketAnalysis[]>([]);
    const [bestSignal, setBestSignal] = useState<MarketAnalysis | null>(null);
    const [validity, setValidity] = useState(0);
    const [hasFired, setHasFired] = useState(false);

    // Bot panel
    const [stake, setStake] = useState(1.0);
    const [tp, setTp] = useState(10);
    const [sl, setSl] = useState(10);
    const [martingale, setMartingale] = useState(false);
    const [martingaleMultiplier, setMartingaleMultiplier] = useState(2.0);
    const [isBotRunning, setIsBotRunning] = useState(false);
    const [botLog, setBotLog] = useState<string[]>([]);
    const [botPL, setBotPL] = useState(0);
    const [botWins, setBotWins] = useState(0);
    const [botLosses, setBotLosses] = useState(0);
    const [currentBotStake, setCurrentBotStake] = useState(1.0);

    // Internal refs
    const subsRef = useRef<Map<string, () => void>>(new Map());
    const scanRef = useRef(false);
    const validityRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const botRef = useRef(false);
    const botStakeRef = useRef(1.0);

    const { is_socket_opened } = common;

    /* ── utility: subscribe to one symbol ── */
    const subscribeSymbol = useCallback((sym: string): Promise<number[]> => {
        return new Promise(resolve => {
            if (!api_base_ref.current) {
                resolve([]);
                return;
            }
            const acc: number[] = [];

            const doRequest = async () => {
                try {
                    const api = api_base_ref.current!;
                    let resp: any;
                    try {
                        resp = await api.send({
                            ticks_history: sym,
                            count: 120,
                            end: 'latest',
                            style: 'ticks',
                            subscribe: 1,
                        });
                    } catch (e: any) {
                        if (e?.error?.code === 'AlreadySubscribed') {
                            resp = await api.send({
                                ticks_history: sym,
                                count: 120,
                                end: 'latest',
                                style: 'ticks',
                            });
                        } else throw e;
                    }

                    // seed from history
                    const hist = resp.history || resp.ticks_history;
                    if (hist?.prices) {
                        hist.prices.forEach((p: any) => {
                            const s = String(p);
                            const dig = parseInt(s[s.length - 1]);
                            if (!isNaN(dig)) acc.push(dig);
                        });
                    }

                    const streamId = resp.subscription?.id;

                    // live sub
                    const sub = api.onMessage().subscribe((msg: any) => {
                        if (msg.msg_type === 'tick' && msg.tick?.symbol === sym) {
                            const s = String(msg.tick.quote);
                            const dig = parseInt(s[s.length - 1]);
                            if (!isNaN(dig)) {
                                acc.push(dig);
                                if (acc.length > 120) acc.shift();
                                setMarketData(prev => ({
                                    ...prev,
                                    [sym]: { ticks: [...acc], price: String(msg.tick.quote) },
                                }));
                            }
                        }
                    });

                    subsRef.current.set(sym, () => {
                        sub.unsubscribe();
                        if (streamId && api) {
                            try {
                                api.send({ forget: streamId });
                            } catch (_) {
                                // ignore
                            }
                        }
                    });

                    resolve([...acc]);
                } catch (err) {
                    console.warn(`[SignalCentre] Failed to subscribe ${sym}`, err);
                    resolve([]);
                }
            };
            doRequest();
        });
    }, []);

    /* ── get api_base lazily ── */
    const api_base_ref = useRef<any>(null);
    useEffect(() => {
        import('@/external/bot-skeleton').then(mod => {
            api_base_ref.current = mod.api_base.api;
        });
    }, []);

    /* ── Clear all subscriptions ── */
    const clearAllSubs = useCallback(() => {
        subsRef.current.forEach(unsub => {
            try {
                unsub();
            } catch (_) {
                // ignore
            }
        });
        subsRef.current.clear();
    }, []);

    /* ── Validity countdown ── */
    const startValidity = useCallback(() => {
        setValidity(SIGNAL_VALIDITY_SECONDS);
        if (validityRef.current) clearInterval(validityRef.current);
        validityRef.current = setInterval(() => {
            setValidity(v => {
                if (v <= 1) {
                    clearInterval(validityRef.current!);
                    setBestSignal(null);
                    setHasFired(false);
                    setScanPhase('STANDBY');
                    return 0;
                }
                return v - 1;
            });
        }, 1000);
    }, []);

    /* ── Run the scan ── */
    const runScan = useCallback(async () => {
        if (isScanning) return;
        clearAllSubs();
        setIsScanning(true);
        scanRef.current = true;
        setBestSignal(null);
        setAnalyses([]);
        setScanPhase('SCANNING');
        setValidity(0);
        setHasFired(false);

        const results: MarketAnalysis[] = [];

        for (let i = 0; i < CONTINUOUS_INDICES.length; i++) {
            if (!scanRef.current) break;
            const { symbol, label } = CONTINUOUS_INDICES[i];
            setScanningIndex(i);

            const digits = await subscribeSymbol(symbol);
            if (digits.length >= 20) {
                const analysis = analyseMarket(symbol, label, digits, tradeType);
                results.push(analysis);
                setMarketData(prev => ({ ...prev, [symbol]: { ticks: digits, price: '' } }));
                setAnalyses([...results]);
            }

            // small delay between markets
            await new Promise(r => setTimeout(r, 600));
        }

        setScanningIndex(-1);

        // Find best
        const found =
            results.filter(r => r.signal !== 'STANDBY').sort((a, b) => b.confidence - a.confidence)[0] ?? null;

        if (found) {
            setScanPhase('SIGNAL_FOUND');
            setBestSignal(found);
            startValidity();
        } else {
            setScanPhase('NO_SIGNAL');
        }

        setIsScanning(false);
    }, [isScanning, tradeType, subscribeSymbol, clearAllSubs, startValidity]);

    const stopScan = useCallback(() => {
        scanRef.current = false;
        setIsScanning(false);
        setScanPhase('STANDBY');
        setScanningIndex(-1);
        clearAllSubs();
    }, [clearAllSubs]);

    /* ── Execute one bot trade ── */
    const executeTrade = useCallback(
        async (analysis: MarketAnalysis, stakeAmt: number) => {
            if (!api_base_ref.current || !is_socket_opened) return null;
            const api = api_base_ref.current;
            const sym = analysis.symbol;

            let contractType = '';
            let barrier: number | undefined;

            switch (analysis.tradeType) {
                case 'EVENODD':
                    contractType = analysis.entry === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';
                    break;
                case 'OVERUNDER':
                    contractType = analysis.entry === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER';
                    barrier = analysis.prediction ?? 4;
                    break;
                case 'RISEFALL':
                    contractType = analysis.entry === 'RISE' ? 'CALL' : 'PUT';
                    break;
                case 'DIFFERS':
                    contractType = 'DIGITDIFF';
                    barrier = analysis.prediction ?? 0;
                    break;
            }

            try {
                const currency = smart_trading.root_store?.client?.currency || 'USD';
                const req: any = {
                    proposal: 1,
                    amount: stakeAmt,
                    basis: 'stake',
                    contract_type: contractType,
                    currency,
                    duration: 1,
                    duration_unit: 't',
                    symbol: sym,
                };
                if (barrier !== undefined) req.barrier = barrier;

                const propResp = await api.send(req);
                if (propResp.error) return null;
                const propId = propResp.proposal?.id;
                if (!propId) return null;

                const buyResp = await api.send({ buy: propId, price: stakeAmt });
                if (buyResp.error) return null;

                return buyResp.buy?.contract_id ?? null;
            } catch (e) {
                console.error('[SignalCentre] Trade error', e);
                return null;
            }
        },
        [is_socket_opened, smart_trading]
    );

    /* ── Bot loop ── */
    const runBotLoop = useCallback(async () => {
        if (!bestSignal || !isBotRunning) return;
        botRef.current = true;
        botStakeRef.current = stake;

        addLog(`🤖 Bot started | Stake: ${stake} | TP: ${tp} | SL: ${sl}`);

        while (botRef.current) {
            const currentAnalysis = bestSignal;
            const currentStake = botStakeRef.current;

            const contractId = await executeTrade(currentAnalysis, currentStake);
            if (!contractId) {
                addLog('⚠️ Trade failed – retrying in 2s');
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            addLog(`📤 Trade placed | ${currentAnalysis.signal} | Stake: ${currentStake.toFixed(2)}`);

            // Wait for result
            const result = await waitForResult(contractId);
            if (result === null) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            if (result.status === 'won') {
                const profit = result.profit;
                setBotWins(w => w + 1);
                setBotPL(pl => pl + profit);
                botStakeRef.current = stake; // reset
                addLog(`✅ WIN  +${profit.toFixed(2)}`);
                if (botPL + profit >= tp) {
                    addLog('🏁 Take Profit hit');
                    botRef.current = false;
                    break;
                }
            } else {
                const loss = result.profit;
                setBotLosses(l => l + 1);
                setBotPL(pl => pl + loss);
                if (martingale) {
                    botStakeRef.current = Math.min(currentStake * martingaleMultiplier, 1000);
                    addLog(`❌ LOSS ${loss.toFixed(2)} | Martingale → ${botStakeRef.current.toFixed(2)}`);
                } else {
                    addLog(`❌ LOSS ${loss.toFixed(2)}`);
                }
                if (Math.abs(botPL + loss) >= sl) {
                    addLog('🛑 Stop Loss hit');
                    botRef.current = false;
                    break;
                }
            }

            setCurrentBotStake(botStakeRef.current);
            await new Promise(r => setTimeout(r, 800));
        }

        setIsBotRunning(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bestSignal, isBotRunning, stake, tp, sl, martingale, martingaleMultiplier, executeTrade, botPL]);

    const waitForResult = (contractId: string | number): Promise<{ status: string; profit: number } | null> => {
        return new Promise(resolve => {
            let timeout: ReturnType<typeof setTimeout>;
            try {
                const api = api_base_ref.current;
                if (!api) {
                    resolve(null);
                    return;
                }

                const sub = api.subscribe({ proposal_open_contract: 1, contract_id: contractId }, (resp: any) => {
                    const poc = resp.proposal_open_contract;
                    if (poc?.is_sold) {
                        clearTimeout(timeout);
                        sub?.unsubscribe?.();
                        resolve({ status: poc.status, profit: parseFloat(poc.profit || '0') });
                    }
                });

                timeout = setTimeout(() => {
                    sub?.unsubscribe?.();
                    resolve(null);
                }, 15000);
            } catch (e) {
                resolve(null);
            }
        });
    };

    const addLog = (msg: string) => {
        const ts = new Date().toLocaleTimeString();
        setBotLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
    };

    useEffect(() => {
        if (isBotRunning && bestSignal) runBotLoop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBotRunning]);

    /* ─── global probs from current symbol ─── */
    const probs = calculateProbabilities();

    /* ── Cleanup ── */
    useEffect(() => {
        return () => {
            clearAllSubs();
            if (validityRef.current) clearInterval(validityRef.current);
        };
    }, [clearAllSubs]);

    /* ─────────────────────── RENDER ─────────────────────── */
    return (
        <div className='signal-centre'>
            {/* ══ HEADER ══ */}
            <div className='sc-header'>
                <div className='sc-header__title'>
                    <span className='sc-header__icon'>📡</span>
                    <div>
                        <h1>Signal Centre</h1>
                        <p>AI-Powered Market Scanner · All Continuous Indices</p>
                    </div>
                </div>
                <div className='sc-header__status'>
                    <span className={classNames('sc-status-dot', { online: is_socket_opened })} />
                    <span>{is_socket_opened ? 'LIVE' : 'OFFLINE'}</span>
                </div>
            </div>

            {/* ══ TRADE TYPE SELECTOR ══ */}
            <div className='sc-trade-type'>
                <div className='sc-trade-type__label'>Preferred Trade Type</div>
                <div className='sc-trade-type__buttons'>
                    {TRADE_TYPES.map(t => (
                        <button
                            key={t.id}
                            id={`sc-type-${t.id.toLowerCase()}`}
                            className={classNames('sc-type-btn', { active: tradeType === t.id })}
                            style={{ '--accent': t.color } as React.CSSProperties}
                            onClick={() => {
                                setTradeType(t.id);
                                setBestSignal(null);
                                setAnalyses([]);
                                setScanPhase('STANDBY');
                            }}
                            disabled={isScanning}
                        >
                            <span className='sc-type-btn__icon'>{t.icon}</span>
                            <span className='sc-type-btn__label'>{t.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ══ SCAN CONTROLS ══ */}
            <div className='sc-scan-controls'>
                <div className='sc-scan-phase'>
                    <div
                        className={classNames('sc-phase-badge', {
                            scanning: scanPhase === 'SCANNING',
                            found: scanPhase === 'SIGNAL_FOUND',
                            none: scanPhase === 'NO_SIGNAL',
                            standby: scanPhase === 'STANDBY',
                        })}
                    >
                        {scanPhase === 'STANDBY' && (
                            <>
                                <span className='sc-phase-dot' />
                                ANALYSIS STANDBY
                            </>
                        )}
                        {scanPhase === 'SCANNING' && (
                            <>
                                <span className='sc-phase-dot pulse' />
                                SCANNING MARKETS…
                            </>
                        )}
                        {scanPhase === 'SIGNAL_FOUND' && (
                            <>
                                <span className='sc-phase-dot blink' />
                                SIGNAL FOUND
                            </>
                        )}
                        {scanPhase === 'NO_SIGNAL' && (
                            <>
                                <span className='sc-phase-dot' />
                                NO QUALIFYING SIGNAL
                            </>
                        )}
                    </div>
                    <div className='sc-scan-info'>Markets scanned: All Continuous Indices (120 ticks each)</div>
                </div>
                <div className='sc-scan-btns'>
                    {!isScanning ? (
                        <button
                            id='sc-btn-start-scan'
                            className='sc-btn sc-btn--scan'
                            onClick={runScan}
                            disabled={!is_socket_opened}
                        >
                            <span className='sc-btn__icon'>🔍</span> Scan &amp; Execute
                        </button>
                    ) : (
                        <button id='sc-btn-stop-scan' className='sc-btn sc-btn--stop' onClick={stopScan}>
                            <span className='sc-btn__icon'>⛔</span> Stop Scan
                        </button>
                    )}
                </div>
            </div>

            {/* ══ MARKET SCAN GRID ══ */}
            {(isScanning || analyses.length > 0) && (
                <div className='sc-market-grid'>
                    {CONTINUOUS_INDICES.map((m, idx) => {
                        const analysis = analyses.find(a => a.symbol === m.symbol);
                        const isActive = scanningIndex === idx;
                        const isComplete = !!analysis;
                        const hasSignal = isComplete && analysis.signal !== 'STANDBY';

                        return (
                            <div
                                key={m.symbol}
                                className={classNames('sc-market-card', {
                                    'sc-market-card--scanning': isActive,
                                    'sc-market-card--complete': isComplete,
                                    'sc-market-card--signal': hasSignal,
                                })}
                            >
                                <div className='sc-market-card__header'>
                                    <span className='sc-market-card__name'>{m.label}</span>
                                    <span className='sc-market-card__sym'>{m.symbol}</span>
                                </div>
                                {isActive && !isComplete && (
                                    <div className='sc-market-card__loader'>
                                        <div className='sc-loader-bar'>
                                            <div className='sc-loader-bar__fill' />
                                        </div>
                                        <span>Fetching 120 ticks…</span>
                                    </div>
                                )}
                                {isComplete && analysis && (
                                    <div className='sc-market-card__result'>
                                        <div className='sc-market-mini-stats'>
                                            <span>E:{analysis.evenPct.toFixed(0)}%</span>
                                            <span>O:{analysis.oddPct.toFixed(0)}%</span>
                                            <span>↑:{analysis.overPct.toFixed(0)}%</span>
                                            <span>↓:{analysis.underPct.toFixed(0)}%</span>
                                        </div>
                                        <div
                                            className={classNames('sc-market-signal', {
                                                found: hasSignal,
                                            })}
                                        >
                                            {hasSignal ? analysis.signal : 'STANDBY'}
                                        </div>
                                        {hasSignal && (
                                            <div className='sc-confidence-bar'>
                                                <div
                                                    className='sc-confidence-bar__fill'
                                                    style={{ width: `${analysis.confidence}%` }}
                                                />
                                                <span>{analysis.confidence.toFixed(0)}%</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!isActive && !isComplete && (
                                    <div className='sc-market-card__pending'>
                                        <span className='sc-pending-dot' />
                                        Queued
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ══ BEST SIGNAL PANEL ══ */}
            {bestSignal && scanPhase === 'SIGNAL_FOUND' && (
                <div className='sc-best-signal'>
                    <div className='sc-best-signal__header'>
                        <div className='sc-best-signal__badge'>🎯 SIGNAL FOUND</div>
                        <div className='sc-validity'>
                            <span className='sc-validity__label'>Valid for</span>
                            <span className={classNames('sc-validity__count', { urgent: validity <= 15 })}>
                                {validity}s
                            </span>
                        </div>
                    </div>

                    <div className='sc-best-signal__body'>
                        <div className='sc-signal-row'>
                            <div className='sc-sig-item'>
                                <div className='sc-sig-item__label'>MARKET</div>
                                <div className='sc-sig-item__val'>{bestSignal.label}</div>
                                <div className='sc-sig-item__sub'>{bestSignal.symbol}</div>
                            </div>
                            <div className='sc-sig-item'>
                                <div className='sc-sig-item__label'>TRADE TYPE</div>
                                <div className='sc-sig-item__val sc-sig-item__val--trade'>{bestSignal.signal}</div>
                            </div>
                            <div className='sc-sig-item'>
                                <div className='sc-sig-item__label'>ENTRY</div>
                                <div className='sc-sig-item__val sc-sig-item__val--entry'>
                                    {bestSignal.entry || '—'}
                                </div>
                                {bestSignal.prediction !== null && (
                                    <div className='sc-sig-item__sub'>Barrier / Digit: {bestSignal.prediction}</div>
                                )}
                            </div>
                            <div className='sc-sig-item'>
                                <div className='sc-sig-item__label'>CONFIDENCE</div>
                                <div
                                    className={classNames('sc-sig-item__val sc-sig-item__val--conf', {
                                        high: bestSignal.confidence >= 70,
                                        medium: bestSignal.confidence >= 45,
                                        low: bestSignal.confidence < 45,
                                    })}
                                >
                                    {bestSignal.confidence.toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        {/* Prediction cards */}
                        <div className='sc-pred-grid'>
                            <div className='sc-pred-card sc-pred-card--eo'>
                                <div className='sc-pred-card__title'>Even / Odd</div>
                                <div className='sc-pred-card__row'>
                                    <span>EVEN</span>
                                    <div className='sc-pred-bar'>
                                        <div
                                            className='sc-pred-bar__fill sc-pred-bar__fill--even'
                                            style={{ width: `${bestSignal.evenPct}%` }}
                                        />
                                    </div>
                                    <span className='sc-pred-pct'>{bestSignal.evenPct.toFixed(1)}%</span>
                                </div>
                                <div className='sc-pred-card__row'>
                                    <span>ODD</span>
                                    <div className='sc-pred-bar'>
                                        <div
                                            className='sc-pred-bar__fill sc-pred-bar__fill--odd'
                                            style={{ width: `${bestSignal.oddPct}%` }}
                                        />
                                    </div>
                                    <span className='sc-pred-pct'>{bestSignal.oddPct.toFixed(1)}%</span>
                                </div>
                            </div>

                            <div className='sc-pred-card sc-pred-card--ou'>
                                <div className='sc-pred-card__title'>Over / Under</div>
                                <div className='sc-pred-card__row'>
                                    <span>OVER</span>
                                    <div className='sc-pred-bar'>
                                        <div
                                            className='sc-pred-bar__fill sc-pred-bar__fill--over'
                                            style={{ width: `${bestSignal.overPct}%` }}
                                        />
                                    </div>
                                    <span className='sc-pred-pct'>{bestSignal.overPct.toFixed(1)}%</span>
                                </div>
                                <div className='sc-pred-card__row'>
                                    <span>UNDER</span>
                                    <div className='sc-pred-bar'>
                                        <div
                                            className='sc-pred-bar__fill sc-pred-bar__fill--under'
                                            style={{ width: `${bestSignal.underPct}%` }}
                                        />
                                    </div>
                                    <span className='sc-pred-pct'>{bestSignal.underPct.toFixed(1)}%</span>
                                </div>
                            </div>

                            <div className='sc-pred-card sc-pred-card--dm'>
                                <div className='sc-pred-card__title'>Differs / Matches</div>
                                <div className='sc-pred-dm-row'>
                                    <div className='sc-pred-dm-item'>
                                        <div className='sc-pred-dm-item__label'>Best DIFFER</div>
                                        <div className='sc-pred-dm-item__digit sc-pred-dm-item__digit--safe'>
                                            {bestSignal.differsBest}
                                        </div>
                                        <div className='sc-pred-dm-item__sub'>Least frequent</div>
                                    </div>
                                    <div className='sc-pred-dm-item'>
                                        <div className='sc-pred-dm-item__label'>Best MATCH</div>
                                        <div className='sc-pred-dm-item__digit sc-pred-dm-item__digit--hot'>
                                            {bestSignal.matchesBest}
                                        </div>
                                        <div className='sc-pred-dm-item__sub'>Hottest digit</div>
                                    </div>
                                </div>
                            </div>

                            <div className='sc-pred-card sc-pred-card--rf'>
                                <div className='sc-pred-card__title'>Rise / Fall</div>
                                <div className='sc-pred-card__row'>
                                    <span>RISE</span>
                                    <div className='sc-pred-bar'>
                                        <div
                                            className='sc-pred-bar__fill sc-pred-bar__fill--rise'
                                            style={{ width: `${bestSignal.risePct}%` }}
                                        />
                                    </div>
                                    <span className='sc-pred-pct'>{bestSignal.risePct.toFixed(1)}%</span>
                                </div>
                                <div className='sc-pred-card__row'>
                                    <span>FALL</span>
                                    <div className='sc-pred-bar'>
                                        <div
                                            className='sc-pred-bar__fill sc-pred-bar__fill--fall'
                                            style={{ width: `${bestSignal.fallPct}%` }}
                                        />
                                    </div>
                                    <span className='sc-pred-pct'>{bestSignal.fallPct.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Market behaviour description */}
                        <div className='sc-behaviour-box'>
                            <span className='sc-behaviour-box__label'>Market Behaviour · {bestSignal.symbol}</span>
                            <p>
                                Scanning the last 120 ticks shows a{' '}
                                <strong>{bestSignal.deviation.toFixed(1)}% deviation</strong> from the equilibrium in
                                favour of <strong>{bestSignal.entry || bestSignal.signal}</strong>. Confidence level{' '}
                                <strong>{bestSignal.confidence.toFixed(1)}%</strong>. Signal expires in{' '}
                                <strong>{validity}s</strong>.
                                {bestSignal.prediction !== null &&
                                    ` Suggested barrier / digit: ${bestSignal.prediction}.`}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ BOT EXECUTION PANEL ══ */}
            <div className='sc-bot-panel'>
                <div className='sc-bot-panel__header'>
                    <span className='sc-bot-panel__icon'>🤖</span>
                    <span>Run Bot with Signal</span>
                    {isBotRunning && <span className='sc-bot-running-badge'>RUNNING</span>}
                </div>

                <div className='sc-bot-inputs'>
                    <div className='sc-bot-field'>
                        <label htmlFor='sc-stake'>Stake (USD)</label>
                        <input
                            id='sc-stake'
                            type='number'
                            min='0.35'
                            step='0.1'
                            value={stake}
                            onChange={e => setStake(parseFloat(e.target.value) || 0.35)}
                            disabled={isBotRunning}
                        />
                    </div>
                    <div className='sc-bot-field'>
                        <label htmlFor='sc-tp'>Take Profit</label>
                        <input
                            id='sc-tp'
                            type='number'
                            min='1'
                            step='1'
                            value={tp}
                            onChange={e => setTp(parseFloat(e.target.value) || 1)}
                            disabled={isBotRunning}
                        />
                    </div>
                    <div className='sc-bot-field'>
                        <label htmlFor='sc-sl'>Stop Loss</label>
                        <input
                            id='sc-sl'
                            type='number'
                            min='1'
                            step='1'
                            value={sl}
                            onChange={e => setSl(parseFloat(e.target.value) || 1)}
                            disabled={isBotRunning}
                        />
                    </div>
                    <div className='sc-bot-field sc-bot-field--toggle'>
                        <label>Martingale</label>
                        <div
                            id='sc-martingale-toggle'
                            className={classNames('sc-toggle', { active: martingale })}
                            onClick={() => !isBotRunning && setMartingale(m => !m)}
                        >
                            <div className='sc-toggle__knob' />
                        </div>
                        {martingale && (
                            <input
                                className='sc-martingale-mult'
                                id='sc-martingale-mult'
                                type='number'
                                min='1.1'
                                max='5'
                                step='0.1'
                                value={martingaleMultiplier}
                                onChange={e => setMartingaleMultiplier(parseFloat(e.target.value) || 2)}
                                disabled={isBotRunning}
                            />
                        )}
                    </div>
                </div>

                {/* Bot stats */}
                {botWins + botLosses > 0 && (
                    <div className='sc-bot-stats'>
                        <div className='sc-bot-stat'>
                            <span>P/L</span>
                            <span className={botPL >= 0 ? 'profit' : 'loss'}>
                                {botPL >= 0 ? '+' : ''}
                                {botPL.toFixed(2)}
                            </span>
                        </div>
                        <div className='sc-bot-stat'>
                            <span>Wins</span>
                            <span className='profit'>{botWins}</span>
                        </div>
                        <div className='sc-bot-stat'>
                            <span>Losses</span>
                            <span className='loss'>{botLosses}</span>
                        </div>
                        <div className='sc-bot-stat'>
                            <span>Stake</span>
                            <span>{currentBotStake.toFixed(2)}</span>
                        </div>
                    </div>
                )}

                <button
                    id='sc-run-bot-btn'
                    className={classNames('sc-run-bot-btn', {
                        running: isBotRunning,
                        disabled: !bestSignal && !isBotRunning,
                    })}
                    onClick={() => {
                        if (isBotRunning) {
                            botRef.current = false;
                            setIsBotRunning(false);
                            addLog('⏹ Bot stopped by user');
                        } else if (bestSignal) {
                            setBotPL(0);
                            setBotWins(0);
                            setBotLosses(0);
                            setCurrentBotStake(stake);
                            setIsBotRunning(true);
                        }
                    }}
                    disabled={!isBotRunning && !bestSignal}
                >
                    {isBotRunning
                        ? '⛔ STOP BOT'
                        : !bestSignal
                          ? '🔍 Scan First to Enable'
                          : '🚀 START BOT WITH THIS SIGNAL'}
                </button>

                {/* Console log */}
                {botLog.length > 0 && (
                    <div className='sc-bot-console'>
                        <div className='sc-bot-console__header'>Bot Console</div>
                        {botLog.map((line, i) => (
                            <div key={i} className='sc-bot-console__line'>
                                {line}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default SignalCentreTab;
