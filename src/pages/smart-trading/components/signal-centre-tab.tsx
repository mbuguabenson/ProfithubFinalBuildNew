import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base, observer as globalObserver } from '@/external/bot-skeleton';
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
    { id: 'MATCHES', label: 'Matches', icon: '🎯', color: '#8b5cf6' },
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
    deviation: number; // how far the dominant side is from 50%
    confidence: number; // 0-100
    signal: string;
    entry: string;
    tradeType: string;
    prediction: number | number[] | null;
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
        prediction: number | number[] | null = null,
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
                
                if (dom === 'OVER') {
                    // Suggest barriers for Over: If Over 0 is > 55%
                    prediction = overPct > 55 ? [0, 1, 2, 3] : 0;
                } else {
                    // Suggest barriers for Under: If Under 9 is > 55%
                    prediction = underPct > 55 ? [9, 8, 7, 6] : 9;
                }
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
            deviation = 10 - leastPct;
            score = Math.min(deviation * 5, 100);
            if (score >= 40) {
                signal = `DIFFER ${leastDigit}`;
                entry = `Avoid digit ${leastDigit}`;
                prediction = leastDigit;
            }
            break;
        }
        case 'MATCHES': {
            const mostFreq = sorted[0][1];
            const mostDigit = Number(sorted[0][0]);
            const mostPct = (mostFreq / total) * 100;
            deviation = mostPct - 10;
            score = Math.min(deviation * 8, 100);
            
            // Multiple predictions for matches: top 3 hottest digits
            const top3 = sorted.slice(0, 3).map(s => Number(s[0]));
            
            if (score >= 30) {
                signal = `MATCH ${mostDigit}`;
                entry = `Target digit ${mostDigit}`;
                prediction = top3;
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
    const { common, smart_trading } = useStore();
    const { is_socket_opened } = common;
    const currency = smart_trading?.root_store?.client?.currency || 'USD';

    // ── Local state ──
    const [tradeType, setTradeType] = useState<string>('EVENODD');
    const [isScanning, setIsScanning] = useState(false);
    const [scanPhase, setScanPhase] = useState<string>('STANDBY');
    const [scanningIndex, setScanningIndex] = useState(-1);
    const [analyses, setAnalyses] = useState<MarketAnalysis[]>([]);
    const [bestSignal, setBestSignal] = useState<MarketAnalysis | null>(null);
    const [validity, setValidity] = useState(0);

    // Bot settings
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
    const [ticks, setTicks] = useState(1);
    const [bulkTrades, setBulkTrades] = useState(1);
    const [compoundStake, setCompoundStake] = useState(false);
    const [alternateMarket, setAlternateMarket] = useState(false);
    const [alternateAfterLosses] = useState(3);
    const [alternateMarketSymbol] = useState('R_10');
    const [alternateTradeType] = useState('EVENODD');
    const [consecutiveLosses, setConsecutiveLosses] = useState(0);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [activeDashboardTab, setActiveDashboardTab] = useState<'SUMMARY' | 'TRANSACTIONS' | 'JOURNAL'>('SUMMARY');

    const [useMultipleMatches, setUseMultipleMatches] = useState(false);
    const [matchPredictions, setMatchPredictions] = useState<number[]>([0]);


    const subsRef = useRef<Map<string, () => void>>(new Map());
    const scanRef = useRef(false);
    const validityRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const botRef = useRef(false);
    const botStakeRef = useRef(1.0);

    const api_base_ref = useRef<any>(null);
    useEffect(() => {
        import('@/external/bot-skeleton').then(mod => {
            api_base_ref.current = mod.api_base.api;
        });
    }, []);

    const subscribeSymbol = useCallback((sym: string): Promise<number[]> => {
        return new Promise(resolve => {
            if (!api_base_ref.current) { resolve([]); return; }
            const acc: number[] = [];
            const api = api_base_ref.current;
            
            const doRequest = async () => {
                try {
                    const resp = await api.send({
                        ticks_history: sym,
                        count: 120,
                        end: 'latest',
                        style: 'ticks',
                        subscribe: 1,
                    });
                    
                    const hist = resp.history || resp.ticks_history;
                    if (hist?.prices) {
                        hist.prices.forEach((p: any) => {
                            const s = String(p);
                            const dig = parseInt(s[s.length - 1]);
                            if (!isNaN(dig)) acc.push(dig);
                        });
                    }

                    const streamId = resp.subscription?.id;
                    const sub = api.onMessage().subscribe((msg: any) => {
                        if (msg.msg_type === 'tick' && msg.tick?.symbol === sym) {
                            const s = String(msg.tick.quote);
                            const dig = parseInt(s[s.length - 1]);
                            if (!isNaN(dig)) {
                                acc.push(dig);
                                if (acc.length > 120) acc.shift();
                            }
                        }
                    });


                    subsRef.current.set(sym, () => {
                        sub.unsubscribe();
                        if (streamId) api.send({ forget: streamId }).catch(() => {});
                    });

                    resolve([...acc]);
                } catch (err) { resolve([]); }
            };
            doRequest();
        });
    }, []);

    const clearAllSubs = useCallback(() => {
        subsRef.current.forEach(unsub => unsub());
        subsRef.current.clear();
    }, []);

    const startValidity = useCallback(() => {
        setValidity(SIGNAL_VALIDITY_SECONDS);
        if (validityRef.current) clearInterval(validityRef.current);
        validityRef.current = setInterval(() => {
            setValidity(v => {
                if (v <= 1) {
                    clearInterval(validityRef.current!);
                    setBestSignal(null);
                    setScanPhase('STANDBY');
                    return 0;
                }
                return v - 1;
            });
        }, 1000);
    }, []);

    const runScan = useCallback(async () => {
        if (isScanning) return;
        clearAllSubs();
        setIsScanning(true);
        scanRef.current = true;
        setBestSignal(null);
        setAnalyses([]);
        setScanPhase('SCANNING');
        
        const results: MarketAnalysis[] = [];
        for (let i = 0; i < CONTINUOUS_INDICES.length; i++) {
            if (!scanRef.current) break;
            const { symbol, label } = CONTINUOUS_INDICES[i];
            setScanningIndex(i);
            const digits = await subscribeSymbol(symbol);
            if (digits.length >= 20) {
                const analysis = analyseMarket(symbol, label, digits, tradeType);
                results.push(analysis);
                setAnalyses([...results]);
            }
            await new Promise(r => setTimeout(r, 600));
        }

        const found = results.filter(r => r.signal !== 'STANDBY').sort((a, b) => b.confidence - a.confidence)[0] || null;
        if (found) {
            setBestSignal(found);
            setScanPhase('SIGNAL_FOUND');
            startValidity();
        } else {
            setScanPhase('NO_SIGNAL');
        }
        setIsScanning(false);
        setScanningIndex(-1);
    }, [isScanning, tradeType, subscribeSymbol, clearAllSubs, startValidity]);

    const stopScan = useCallback(() => {
        scanRef.current = false;
        setIsScanning(false);
        setScanPhase('STANDBY');
        clearAllSubs();
    }, [clearAllSubs]);

    const executeTrade = useCallback(async (analysis: MarketAnalysis, stakeAmt: number, customPrediction?: number) => {
        if (!api_base_ref.current || !is_socket_opened) return null;
        const api = api_base_ref.current;
        let contractType = '';
        let barrier: number | undefined;

        switch (analysis.tradeType) {
            case 'EVENODD': contractType = analysis.entry === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD'; break;
            case 'OVERUNDER': 
                contractType = analysis.entry === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER';
                barrier = Array.isArray(analysis.prediction) ? analysis.prediction[0] : (analysis.prediction ?? 4);
                break;
            case 'MATCHES':
                contractType = 'DIGITMATCH';
                barrier = customPrediction ?? (Array.isArray(analysis.prediction) ? analysis.prediction[0] : (analysis.prediction ?? 0));
                break;
            case 'RISEFALL': contractType = analysis.entry === 'RISE' ? 'CALL' : 'PUT'; break;
            case 'DIFFERS':
                contractType = 'DIGITDIFF';
                barrier = Array.isArray(analysis.prediction) ? analysis.prediction[0] : (analysis.prediction ?? 0);
                break;
        }

        try {
            const req: any = {
                proposal: 1, amount: stakeAmt, basis: 'stake', contract_type: contractType,
                currency: currency, duration: ticks, duration_unit: 't', symbol: analysis.symbol,
            };
            if (barrier !== undefined) req.barrier = barrier;
            const resp = await api.send(req);
            if (resp.error) {
                addLog(`❌ Proposal Error: ${resp.error.message}`);
                globalObserver.emit('Error', resp.error);
                return null;
            }

            globalObserver.emit('contract.status', { id: 'contract.purchase_sent' });

            const buy = await api.send({ buy: resp.proposal.id, price: stakeAmt });
            if (buy.error) {
                addLog(`❌ Buy Error: ${buy.error.message}`);
                globalObserver.emit('Error', buy.error);
                return null;
            }

            globalObserver.emit('contract.status', { id: 'contract.purchase_received', buy: buy.buy });
            return buy.buy?.contract_id || null;
        } catch (e: any) { 
            addLog(`❌ Execution Exception: ${e.message || e}`);
            return null; 
        }
    }, [is_socket_opened, ticks, currency]);



    const waitForResult = (id: string | number): Promise<{status: string, profit: number} | null> => {
        return new Promise(resolve => {
            const api = api_base_ref.current;
            if (!api) { resolve(null); return; }
            
            // Subscribe to POC for this contract
            api.send({ proposal_open_contract: 1, contract_id: id, subscribe: 1 });

            const sub = api.onMessage().subscribe((msg: any) => {
                const poc = msg.proposal_open_contract;
                if (poc && poc.contract_id == id && poc.is_sold) {
                    sub.unsubscribe();
                    globalObserver.emit('bot.contract', poc);
                    globalObserver.emit('contract.status', { id: 'contract.sold', contract: poc });
                    resolve({ 
                        status: poc.status, 
                        profit: parseFloat(poc.profit || '0'),
                        entry: poc.entry_tick_display_value,
                        exit: poc.exit_tick_display_value,
                        buyId: poc.transaction_ids?.buy,
                        sellId: poc.transaction_ids?.sell,
                        lastDigit: poc.exit_tick_display_value ? parseInt(poc.exit_tick_display_value.slice(-1)) : null
                    });
                }
            });


            
            // Timeout after 30 seconds
            setTimeout(() => { 
                sub.unsubscribe(); 
                resolve(null); 
            }, 30000);
        });
    };


    const addLog = (msg: string) => {
        const ts = new Date().toLocaleTimeString();
        setBotLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
    };

    const runBotLoop = useCallback(async () => {
        if (!bestSignal || !isBotRunning) return;
        botRef.current = true;
        botStakeRef.current = stake;
        let runningPL = 0;
        setConsecutiveLosses(0);
        addLog(`🤖 Bot Started | Strategy: ${tradeType} | Stake: ${stake}`);

        while (botRef.current) {
            let currentAnalysis = bestSignal;
            if (alternateMarket && consecutiveLosses >= alternateAfterLosses) {
                addLog(`🔄 Alternate Switch: ${alternateMarketSymbol} | ${alternateTradeType}`);
                currentAnalysis = { ...bestSignal, symbol: alternateMarketSymbol, tradeType: alternateTradeType };
            }

            const currentStake = botStakeRef.current;
            const tradePromises: Promise<any>[] = [];

            if (tradeType === 'MATCHES' && useMultipleMatches) {
                for (const pred of matchPredictions) {
                    for (let i = 0; i < bulkTrades; i++) {
                        tradePromises.push(executeTrade(currentAnalysis, currentStake, pred));
                        await new Promise(r => setTimeout(r, 150)); // Prevent overlapping API errors
                    }
                }
            } else {
                for (let i = 0; i < bulkTrades; i++) {
                    tradePromises.push(executeTrade(currentAnalysis, currentStake));
                    await new Promise(r => setTimeout(r, 150));
                }
            }


            const ids = (await Promise.all(tradePromises)).filter(id => id !== null);

            if (ids.length === 0) {
                addLog('⚠️ Execution failed - retrying...');
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            addLog(`📤 ${ids.length} Trade(s) placed on ${currentAnalysis.symbol}`);
            const results = await Promise.all(ids.map(id => waitForResult(id!)));
            
            let batchP = 0, batchW = 0, batchL = 0;
            results.forEach(res => {
                if (!res) return;
                batchP += res.profit;
                if (res.status === 'won') batchW++; else batchL++;
                
                setTransactions(prev => [{
                    id: res.buyId || Math.random().toString(36).substr(2, 9),
                    time: new Date().toLocaleTimeString(),
                    symbol: currentAnalysis.symbol,
                    type: currentAnalysis.tradeType,
                    stake: currentStake,
                    profit: res.profit,
                    status: res.status,
                    entry: res.entry,
                    exit: res.exit,
                    lastDigit: res.lastDigit,
                    power: currentAnalysis.confidence
                }, ...prev].slice(0, 100));
            });

            runningPL += batchP;
            setBotWins(prev => prev + batchW);
            setBotLosses(prev => prev + batchL);
            setBotPL(runningPL);

            if (batchP > 0) {
                setConsecutiveLosses(0);
                addLog(`✅ Wins: ${batchW}, Losses: ${batchL} | Net: +${batchP.toFixed(2)}`);
                if (compoundStake) {
                    botStakeRef.current = parseFloat((botStakeRef.current + batchP).toFixed(2));
                    addLog(`📈 Compounding → Stake: ${botStakeRef.current}`);
                } else botStakeRef.current = stake;
                
                if (runningPL >= tp) { 
                    addLog(`🏆 Take Profit hit! Total P/L: ${runningPL.toFixed(2)}`); 
                    break; 
                }
            } else {
                setConsecutiveLosses(prev => prev + 1);
                addLog(`❌ Wins: ${batchW}, Losses: ${batchL} | Net: ${batchP.toFixed(2)}`);
                if (martingale) {
                    botStakeRef.current = Math.min(currentStake * martingaleMultiplier, 500);
                    addLog(`📉 Martingale → Stake: ${botStakeRef.current.toFixed(2)}`);
                } else botStakeRef.current = stake;

                if (Math.abs(runningPL) >= sl && runningPL < 0) { 
                    addLog(`🛑 Stop Loss hit! Total P/L: ${runningPL.toFixed(2)}`); 
                    break;
                }
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        setIsBotRunning(false);
        botRef.current = false;
    }, [bestSignal, isBotRunning, stake, tp, sl, martingale, martingaleMultiplier, bulkTrades, compoundStake, alternateMarket, alternateAfterLosses, alternateMarketSymbol, alternateTradeType, consecutiveLosses, executeTrade, tradeType, useMultipleMatches, matchPredictions]);

    useEffect(() => {
        if (isBotRunning) runBotLoop();
    }, [isBotRunning, runBotLoop]);

    return (
        <div className='signal-centre'>
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

            <div className='sc-trade-type'>
                <div className='sc-trade-type__label'>Preferred Strategy</div>
                <div className='sc-trade-type__buttons'>
                    {TRADE_TYPES.map(t => (
                        <button
                            key={t.id}
                            className={classNames('sc-type-btn', { active: tradeType === t.id })}
                            style={{ '--accent': t.color } as any}
                            onClick={() => { setTradeType(t.id); setBestSignal(null); setAnalyses([]); setScanPhase('STANDBY'); }}
                            disabled={isScanning}
                        >
                            <span className='sc-type-btn__icon'>{t.icon}</span>
                            <span className='sc-type-btn__label'>{t.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className='sc-scan-controls'>
                <div className='sc-scan-phase'>
                    <div className={classNames('sc-phase-badge', scanPhase.toLowerCase())}>
                        <span className='sc-phase-dot' />
                        {scanPhase.replace('_', ' ')}
                    </div>
                </div>
                <div className='sc-scan-btns'>
                    {!isScanning ? (
                        <button className='sc-btn sc-btn--scan' onClick={runScan} disabled={!is_socket_opened}>
                            🔍 Start Scanning
                        </button>
                    ) : (
                        <button className='sc-btn sc-btn--stop' onClick={stopScan}>
                            ⛔ Stop Scan
                        </button>
                    )}
                </div>
            </div>

            {(isScanning || analyses.length > 0) && (
                <div className='sc-market-grid'>
                    {CONTINUOUS_INDICES.map((m, idx) => {
                        const analysis = analyses.find(a => a.symbol === m.symbol);
                        const isActive = scanningIndex === idx;
                        return (
                            <div key={m.symbol} className={classNames('sc-market-card', { active: isActive, complete: !!analysis })}>
                                <div className='sc-market-card__header'>
                                    <span>{m.label}</span>
                                </div>
                                {analysis ? (
                                    <div className='sc-market-stats'>
                                        <div className='sc-stat-row'>
                                            <span>Confidence</span>
                                            <span>{analysis.confidence.toFixed(1)}%</span>
                                        </div>
                                        <div className='sc-stat-row'>
                                            <span>Signal</span>
                                            <span className='sc-signal-badge'>{analysis.signal}</span>
                                        </div>
                                        <div className='sc-mini-progress'>
                                            <div className='sc-mini-progress__fill' style={{ width: `${analysis.confidence}%` }} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className='sc-market-loading'>{isActive ? 'Scanning...' : 'Pending'}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {bestSignal && (
                <div className='sc-best-signal'>
                    <div className='sc-best-signal__header'>
                        <span className='sc-best-signal__icon'>🚀</span>
                        <div>
                            <h2>{bestSignal.label}</h2>
                            <p>Suggested: <strong>{bestSignal.signal}</strong></p>
                        </div>
                        <div className='sc-best-signal__validity'>{validity}s</div>
                    </div>
                    <div className='sc-suggestion-banner'>
                        PRO SUGGESTION: {tradeType === 'OVERUNDER' ? `Use ${bestSignal.entry} ${Array.isArray(bestSignal.prediction) ? bestSignal.prediction.join(', ') : bestSignal.prediction}` : bestSignal.entry}
                    </div>
                </div>
            )}

            <div className='sc-bot-panel'>
                <div className='sc-bot-inputs'>
                    <div className='sc-bot-field'>
                        <label>Stake (USD)</label>
                        <input type='number' value={stake} onChange={e => setStake(parseFloat(e.target.value))} />
                    </div>
                    <div className='sc-bot-field'>
                        <label>TP / SL</label>
                        <div className='sc-input-group'>
                            <input type='number' value={tp} onChange={e => setTp(parseFloat(e.target.value))} placeholder='TP' />
                            <input type='number' value={sl} onChange={e => setSl(parseFloat(e.target.value))} placeholder='SL' />
                        </div>
                    </div>
                    <div className='sc-bot-field'>
                        <label>Ticks</label>
                        <select value={ticks} onChange={e => setTicks(parseInt(e.target.value))}>
                            {[1, 2, 3, 4, 5].map(t => <option key={t} value={t}>{t} Ticks</option>)}
                        </select>
                    </div>
                    <div className='sc-bot-field'>
                        <label>Bulk</label>
                        <input type='number' value={bulkTrades} min='1' max='10' onChange={e => setBulkTrades(parseInt(e.target.value))} />
                    </div>
                </div>
                <div className='sc-bot-toggles'>
                    <button className={classNames('sc-toggle-btn', { active: compoundStake })} onClick={() => setCompoundStake(!compoundStake)}>
                        🔄 Compounding
                    </button>
                    <button className={classNames('sc-toggle-btn', { active: alternateMarket })} onClick={() => setAlternateMarket(!alternateMarket)}>
                        🔀 Alt Market
                    </button>
                </div>

                {tradeType === 'MATCHES' && (
                    <div className='sc-matches-multi-panel'>
                        <button 
                            className={classNames('sc-toggle-btn', { active: useMultipleMatches })} 
                            onClick={() => setUseMultipleMatches(!useMultipleMatches)}
                        >
                            🎯 Multiple Predictions
                        </button>
                        
                        {useMultipleMatches && (
                            <div className='sc-multi-fields'>
                                <div className='sc-bot-field'>
                                    <label>Count</label>
                                    <input 
                                        type='number' 
                                        min='1' 
                                        max='5' 
                                        value={matchPredictions.length} 
                                        onChange={e => {
                                            const n = Math.max(1, Math.min(5, parseInt(e.target.value) || 1));
                                            setMatchPredictions(prev => {
                                                const next = [...prev];
                                                if (n > next.length) {
                                                    while (next.length < n) next.push(0);
                                                } else {
                                                    next.length = n;
                                                }
                                                return next;
                                            });
                                        }} 
                                    />
                                </div>
                                <div className='sc-digit-inputs'>
                                    {matchPredictions.map((digit, i) => (
                                        <input
                                            key={i}
                                            type='number'
                                            min='0'
                                            max='9'
                                            value={digit}
                                            onChange={e => {
                                                const val = parseInt(e.target.value) || 0;
                                                setMatchPredictions(prev => {
                                                    const next = [...prev];
                                                    next[i] = val;
                                                    return next;
                                                });
                                            }}
                                            placeholder={`#${i+1}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <button
                    className={classNames('sc-run-btn', { running: isBotRunning })}
                    onClick={() => setIsBotRunning(!isBotRunning)}
                    disabled={!bestSignal && !isBotRunning}
                >
                    {isBotRunning ? '⛔ STOP BOT' : bestSignal ? '🚀 START BOT' : '🔍 Scan for Signal'}
                </button>
            </div>

            <div className='sc-dashboard'>
                <div className='sc-dashboard__tabs'>
                    {(['SUMMARY', 'TRANSACTIONS', 'JOURNAL'] as const).map(t => (
                        <button 
                            key={t} 
                            className={classNames('sc-dash-tab', { active: activeDashboardTab === t })}
                            onClick={() => setActiveDashboardTab(t)}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                <div className='sc-dashboard__content'>
                    {activeDashboardTab === 'SUMMARY' && (
                        <div className='sc-summary-grid'>
                            <div className='sc-summary-item'>
                                <label>Total Stake</label>
                                <span>{(botWins + botLosses) * stake} {currency}</span>
                            </div>
                            <div className='sc-summary-item'>
                                <label>Contracts Won</label>
                                <span className='won'>{botWins}</span>
                            </div>
                            <div className='sc-summary-item'>
                                <label>Contracts Lost</label>
                                <span className='lost'>{botLosses}</span>
                            </div>
                            <div className='sc-summary-item'>
                                <label>Total P/L</label>
                                <span className={classNames('pl', { win: botPL > 0, loss: botPL < 0 })}>
                                    {botPL.toFixed(2)} {currency}
                                </span>
                            </div>
                            <div className='sc-summary-item'>
                                <label>No. of Runs</label>
                                <span>{botWins + botLosses}</span>
                            </div>
                        </div>
                    )}

                    {activeDashboardTab === 'TRANSACTIONS' && (
                        <div className='sc-table-wrapper'>
                            <table className='sc-table'>
                                <thead>
                                    <tr>
                                        <th>Type</th>
                                        <th>Entry/Exit Spot</th>
                                        <th>Buy Price</th>
                                        <th>P/L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map(tx => (
                                        <tr key={tx.id}>
                                            <td>{tx.type}</td>
                                            <td>{tx.entry || '-'} / {tx.exit || '-'}</td>
                                            <td>{tx.stake.toFixed(2)}</td>
                                            <td className={tx.status}>{tx.profit.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeDashboardTab === 'JOURNAL' && (
                        <div className='sc-journal-view'>
                            <div className='sc-table-wrapper'>
                                <table className='sc-table sc-table--journal'>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Last Digit</th>
                                            <th>Market</th>
                                            <th>Power</th>
                                            <th>Entry/Exit</th>
                                            <th>Result</th>
                                            <th>ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map(tx => (
                                            <tr key={tx.id}>
                                                <td>{tx.time}</td>
                                                <td><span className='sc-digit-badge'>{tx.lastDigit ?? '-'}</span></td>
                                                <td>{tx.symbol}</td>
                                                <td>{tx.power.toFixed(1)}%</td>
                                                <td>{tx.entry || '-'} / {tx.exit || '-'}</td>
                                                <td className={tx.status}>{tx.status.toUpperCase()}</td>
                                                <td className='sc-tx-id'>{tx.id}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className='sc-log-view'>
                                {botLog.map((log, i) => <div key={i} className='sc-log-line'>{log}</div>)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default SignalCentreTab;
