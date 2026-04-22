import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { observer as globalObserver } from '@/external/bot-skeleton';
import { LayoutGrid, BarChart3, Target, Activity, FileText, History, Save, ShieldCheck } from 'lucide-react';
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
    { id: 'EVENODD', label: 'Even / Odd', icon: <Activity />, color: '#6366f1', className: 'evenodd' },
    { id: 'OVERUNDER', label: 'Over / Under', icon: <BarChart3 />, color: '#10b981', className: 'overunder' },
    { id: 'MATCHES', label: 'Matches', icon: <Target />, color: '#f59e0b', className: 'matches' },
    { id: 'DIFFERS', label: 'One Trader', icon: <ShieldCheck />, color: '#ef4444', className: 'differs' },
];

const SIGNAL_VALIDITY_SECONDS = 45;

/* ─────────────────────── ANALYSIS HELPERS ─────────────────────── */

interface MarketAnalysis {
    symbol: string;
    label: string;
    ticks: number[];
    evenPct: number;
    oddPct: number;
    overPct: number;
    underPct: number;
    risePct: number;
    fallPct: number;
    differsBest: number;
    matchesBest: number;
    evenStreak: number;
    oddStreak: number;
    freq: Record<number, number>;
    deviation: number;
    confidence: number;
    signal: string;
    entry: string;
    tradeType: string;
    prediction: number | number[] | null;
    score: number;
}

function analyseMarket(
    symbol: string, 
    label: string, 
    digits: number[], 
    tradeType: string,
    thresholds: { eo: number, ou: number, rf: number } = { eo: 7, ou: 7, rf: 8 }
): MarketAnalysis {
    const last = digits.slice(-120);
    const total = last.length || 1;

    const even = last.filter(d => d % 2 === 0).length;
    const odd = total - even;
    const over = last.filter(d => d >= 5).length;
    const under = total - over;

    // Streaks
    let evenStreak = 0, oddStreak = 0;
    for (let i = last.length - 1; i >= 0; i--) {
        if (last[i] % 2 === 0) { evenStreak++; if (oddStreak > 0) break; }
        else { oddStreak++; if (evenStreak > 0) break; }
    }

    let rises = 0, falls = 0;
    for (let i = 1; i < last.length; i++) {
        if (last[i] > last[i - 1]) rises++;
        else if (last[i] < last[i - 1]) falls++;
    }
    const rf_total = rises + falls || 1;

    const freq: Record<number, number> = {};
    for (let d = 0; d < 10; d++) freq[d] = 0;
    last.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });

    const evenPct = (even / total) * 100;
    const oddPct = (odd / total) * 100;
    const overPct = (over / total) * 100;
    const underPct = (under / total) * 100;
    const risePct = (rises / rf_total) * 100;
    const fallPct = (falls / rf_total) * 100;

    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const matchesBest = Number(sorted[0][0]);
    const differsBest = Number(sorted[sorted.length - 1][0]);

    let deviation = 0, signal = 'STANDBY', entry = '', prediction: number | number[] | null = null, score = 0;

    switch (tradeType) {
        case 'EVENODD': {
            const dom = evenPct > oddPct ? 'EVEN' : 'ODD';
            deviation = Math.abs(evenPct - oddPct);
            score = Math.min(deviation * 3, 100);
            if (deviation >= thresholds.eo) { signal = dom === 'EVEN' ? 'BUY EVEN' : 'BUY ODD'; entry = dom; }
            break;
        }
        case 'OVERUNDER': {
            const dom = overPct > underPct ? 'OVER' : 'UNDER';
            deviation = Math.abs(overPct - underPct);
            score = Math.min(deviation * 3, 100);
            if (deviation >= thresholds.ou) {
                signal = dom === 'OVER' ? 'BUY OVER' : 'BUY UNDER';
                entry = dom;
                prediction = dom === 'OVER' ? (overPct > 55 ? [0, 1, 2, 3] : 0) : (underPct > 55 ? [9, 8, 7, 6] : 9);
            }
            break;
        }
        case 'MATCHES': {
            const mostFreq = sorted[0][1];
            const mostDigit = Number(sorted[0][0]);
            const mostPct = (mostFreq / total) * 100;
            deviation = mostPct - 10;
            score = Math.min(deviation * 8, 100);
            if (score >= 30) { signal = `MATCH ${mostDigit}`; entry = `Target digit ${mostDigit}`; prediction = sorted.slice(0, 3).map(s => Number(s[0])); }
            break;
        }
        case 'DIFFERS': {
            const leastFreq = sorted[sorted.length - 1][1];
            const leastDigit = Number(sorted[sorted.length - 1][0]);
            const leastPct = (leastFreq / total) * 100;
            deviation = 10 - leastPct;
            score = Math.min(deviation * 5, 100);
            if (score >= 40) { signal = `DIFFER ${leastDigit}`; entry = `Avoid digit ${leastDigit}`; prediction = leastDigit; }
            break;
        }
    }

    const confidence = Math.min(score * (Math.min(total, 120) / 120), 100);

    return {
        symbol, label, ticks: last, evenPct, oddPct, overPct, underPct, risePct, fallPct,
        differsBest, matchesBest, evenStreak, oddStreak, freq, deviation, confidence,
        signal, entry, tradeType, prediction, score,
    };
}

/* ─────────────────────── MAIN COMPONENT ─────────────────────── */

const SignalCentreTab = observer(() => {
    const { common, smart_trading } = useStore();
    const { is_socket_opened } = common;
    const currency = smart_trading?.root_store?.client?.currency || 'USD';

    // ── UI State ──
    const [tradeType, setTradeType] = useState<string>('EVENODD');
    const [isScanning, setIsScanning] = useState(false);
    const [scanPhase, setScanPhase] = useState<string>('STANDBY');
    const [scanningIndex, setScanningIndex] = useState(-1);
    const [analyses, setAnalyses] = useState<MarketAnalysis[]>([]);
    const [bestSignal, setBestSignal] = useState<MarketAnalysis | null>(null);
    const [validity, setValidity] = useState(0);
    const [activePanelTab, setActivePanelTab] = useState<'SUMMARY' | 'TRANSACTIONS' | 'JOURNAL'>('SUMMARY');
    const [journalNote, setJournalNote] = useState('');

    // Bot settings
    const [stake, setStake] = useState(1.0);
    const [tp, setTp] = useState(10);
    const [sl, setSl] = useState(10);
    const [isBotRunning, setIsBotRunning] = useState(false);
    const [botLog, setBotLog] = useState<string[]>([]);
    const [botPL, setBotPL] = useState(0);
    const [botWins, setBotWins] = useState(0);
    const [botLosses, setBotLosses] = useState(0);
    const [ticks, setTicks] = useState(1);
    const [compoundStake, setCompoundStake] = useState(false);
    const [alternateMarket, setAlternateMarket] = useState(false);
    const [alternateAfterLosses, setAlternateAfterLosses] = useState(3);
    const [alternateMarketSymbol, setAlternateMarketSymbol] = useState('R_10');
    const [alternateTradeType, setAlternateTradeType] = useState('EVENODD');
    const [consecutiveLosses, setConsecutiveLosses] = useState(0);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [manualPrediction, setManualPrediction] = useState<number | null>(null);

    const subsRef = useRef<Map<string, () => void>>(new Map());
    const scanRef = useRef(false);
    const validityRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const botRef = useRef(false);
    const botStakeRef = useRef(1.0);
    const api_base_ref = useRef<any>(null);

    useEffect(() => {
        import('@/external/bot-skeleton').then(mod => { api_base_ref.current = mod.api_base.api; });
    }, []);

    const subscribeSymbol = useCallback((sym: string): Promise<number[]> => {
        return new Promise(resolve => {
            if (!api_base_ref.current) { resolve([]); return; }
            const acc: number[] = [];
            const api = api_base_ref.current;
            const doRequest = async () => {
                try {
                    const resp = await api.send({ ticks_history: sym, count: 120, end: 'latest', style: 'ticks', subscribe: 1 });
                    const hist = resp.history || resp.ticks_history;
                    if (hist?.prices) hist.prices.forEach((p: any) => { const s = String(p); const dig = parseInt(s[s.length-1]); if (!isNaN(dig)) acc.push(dig); });
                    const streamId = resp.subscription?.id;
                    const sub = api.onMessage().subscribe((msg: any) => {
                        if (msg.msg_type === 'tick' && msg.tick?.symbol === sym) {
                            const s = String(msg.tick.quote); const dig = parseInt(s[s.length-1]);
                            if (!isNaN(dig)) { acc.push(dig); if (acc.length > 120) acc.shift(); }
                        }
                    });
                    subsRef.current.set(sym, () => { sub.unsubscribe(); if (streamId) api.send({ forget: streamId }).catch(() => {}); });
                    resolve([...acc]);
                } catch (err) { resolve([]); }
            };
            doRequest();
        });
    }, []);

    const clearAllSubs = useCallback(() => { subsRef.current.forEach(unsub => unsub()); subsRef.current.clear(); }, []);

    const startValidity = useCallback(() => {
        setValidity(SIGNAL_VALIDITY_SECONDS);
        if (validityRef.current) clearInterval(validityRef.current);
        validityRef.current = setInterval(() => {
            setValidity(v => {
                if (v <= 1) { clearInterval(validityRef.current!); setBestSignal(null); setScanPhase('STANDBY'); return 0; }
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
            const d = await subscribeSymbol(symbol);
            if (d.length >= 20) {
                const res = analyseMarket(symbol, label, d, tradeType);
                results.push(res);
                setAnalyses([...results]);
            }
            await new Promise(r => setTimeout(r, 600));
        }

        const found = results.filter(r => r.signal !== 'STANDBY').sort((a, b) => b.confidence - a.confidence)[0] || null;
        if (found) { setBestSignal(found); setScanPhase('SIGNAL_FOUND'); startValidity(); } 
        else { setScanPhase('NO_SIGNAL'); }
        setIsScanning(false);
        setScanningIndex(-1);
    }, [isScanning, tradeType, subscribeSymbol, clearAllSubs, startValidity]);

    const stopScan = useCallback(() => { scanRef.current = false; setIsScanning(false); setScanPhase('STANDBY'); clearAllSubs(); }, [clearAllSubs]);

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
            case 'DIFFERS':
                contractType = 'DIGITDIFF';
                barrier = Array.isArray(analysis.prediction) ? analysis.prediction[0] : (analysis.prediction ?? 0);
                break;
        }

        try {
            const req: any = { proposal: 1, amount: stakeAmt, basis: 'stake', contract_type: contractType, currency: currency, duration: ticks, duration_unit: 't', symbol: analysis.symbol };
            if (barrier !== undefined) req.barrier = barrier;
            const resp = await api.send(req);
            if (resp.error) return null;
            const buy = await api.send({ buy: resp.proposal.id, price: stakeAmt });
            return buy.buy?.contract_id || null;
        } catch (e) { return null; }
    }, [is_socket_opened, ticks, currency]);

    const waitForResult = (id: string | number): Promise<any> => {
        return new Promise(resolve => {
            const api = api_base_ref.current;
            if (!api) { resolve(null); return; }
            api.send({ proposal_open_contract: 1, contract_id: id, subscribe: 1 });
            const sub = api.onMessage().subscribe((msg: any) => {
                const poc = msg.proposal_open_contract;
                if (poc && poc.contract_id == id && poc.is_sold) {
                    sub.unsubscribe();
                    resolve({ 
                        status: poc.status, profit: parseFloat(poc.profit || '0'),
                        entry: poc.entry_tick_display_value, exit: poc.exit_tick_display_value,
                        buyId: poc.transaction_ids?.buy, lastDigit: poc.exit_tick_display_value ? parseInt(poc.exit_tick_display_value.slice(-1)) : null
                    });
                }
            });
            setTimeout(() => { sub.unsubscribe(); resolve(null); }, 30000);
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
        let rPL = 0;
        setConsecutiveLosses(0);
        addLog(`🚀 Bot Active | Strategy: ${tradeType}`);

        while (botRef.current) {
            let currentAnalysis = bestSignal;
            if (manualPrediction !== null && currentAnalysis) currentAnalysis = { ...currentAnalysis, prediction: manualPrediction };
            if (alternateMarket && consecutiveLosses >= alternateAfterLosses) {
                currentAnalysis = { ...bestSignal, symbol: alternateMarketSymbol, tradeType: alternateTradeType, entry: 'EVEN', prediction: 0 };
            }

            const id = await executeTrade(currentAnalysis, botStakeRef.current);
            if (!id) { await new Promise(r => setTimeout(r, 2000)); continue; }
            
            const res = await waitForResult(id);
            if (res) {
                rPL += res.profit;
                if (res.status === 'won') { setBotWins(w => w + 1); setConsecutiveLosses(0); } else { setBotLosses(l => l + 1); setConsecutiveLosses(c => c + 1); }
                setBotPL(rPL);
                setTransactions(prev => [{
                    id: res.buyId, time: new Date().toLocaleTimeString(), symbol: currentAnalysis.symbol,
                    type: currentAnalysis.tradeType, stake: botStakeRef.current, profit: res.profit, status: res.status,
                    entry: res.entry, exit: res.exit, lastDigit: res.lastDigit, power: currentAnalysis.confidence
                }, ...prev].slice(0, 50));

                if (compoundStake && res.profit > 0) botStakeRef.current = parseFloat((botStakeRef.current + res.profit).toFixed(2));
                else botStakeRef.current = stake;

                if (rPL >= tp || (rPL <= -sl && rPL < 0)) break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        setIsBotRunning(false);
        botRef.current = false;
    }, [bestSignal, isBotRunning, stake, tp, sl, compoundStake, alternateMarket, alternateAfterLosses, alternateMarketSymbol, alternateTradeType, consecutiveLosses, executeTrade, tradeType, manualPrediction]);

    useEffect(() => { if (isBotRunning) runBotLoop(); }, [isBotRunning, runBotLoop]);

    const activeAnalysis = bestSignal || (analyses.length > 0 ? analyses[0] : null);

    return (
        <div className={classNames('signal-centre', tradeType.toLowerCase())}>
            
            {/* ── Top Bar: Tick Display ── */}
            <div className='sc-tick-tracker'>
                <div className='flex items-center gap-4'>
                    <div className='text-xs font-black uppercase text-gray-500 tracking-widest'>Live Ticks</div>
                    <div className='ticks'>
                        {activeAnalysis?.ticks.slice(-10).map((t, i) => (
                            <div key={i} className={classNames('digit', { active: i === 9 })}>{t}</div>
                        ))}
                    </div>
                </div>
                <div className='flex items-center gap-4'>
                    <div className={classNames('sc-status-dot', { online: is_socket_opened })} />
                    <span className='text-xs font-black uppercase'>{is_socket_opened ? 'Connected' : 'Offline'}</span>
                </div>
            </div>

            {/* ── Strategy Selection ── */}
            <div className='sc-strategy-tabs'>
                {TRADE_TYPES.map(t => (
                    <div 
                        key={t.id} 
                        className={classNames('sc-tab-item', t.className, { active: tradeType === t.id })}
                        onClick={() => { setTradeType(t.id); setBestSignal(null); setAnalyses([]); setScanPhase('STANDBY'); }}
                    >
                        <span className='icon'>{t.icon}</span>
                        <span>{t.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Main Dashboard Layout ── */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
                
                {/* ── Left: Market Grid ── */}
                <div className='sc-market-grid'>
                    {CONTINUOUS_INDICES.map((m, idx) => {
                        const analysis = analyses.find(a => a.symbol === m.symbol);
                        const isActive = scanningIndex === idx;
                        const cardTheme = TRADE_TYPES.find(t => t.id === tradeType)?.color;
                        
                        return (
                            <div 
                                key={m.symbol} 
                                className={classNames('sc-market-card', { active: analysis?.symbol === bestSignal?.symbol })}
                                style={{ '--strategy-color': cardTheme } as any}
                                onClick={() => { if (analysis) { setBestSignal(analysis); setScanPhase('SIGNAL_FOUND'); startValidity(); } }}
                            >
                                <div className='sc-card-header'>
                                    <div className='name'>{m.label}</div>
                                    <div className='symbol'>{m.symbol}</div>
                                </div>

                                {analysis ? (
                                    <div className='sc-stats-container'>
                                        {/* Dynamic Stats Based on Strategy */}
                                        {tradeType === 'EVENODD' && (
                                            <>
                                                <div className='sc-stat-row'><label>Even</label><span className='value'>{analysis.evenPct.toFixed(1)}%</span></div>
                                                <div className='sc-progress-wrapper'><div className='fill' style={{ width: `${analysis.evenPct}%` }} /></div>
                                                <div className='sc-stat-row mt-4'><label>Streaks</label><span className='text-xs font-bold'>E: {analysis.evenStreak} | O: {analysis.oddStreak}</span></div>
                                            </>
                                        )}
                                        {tradeType === 'OVERUNDER' && (
                                            <>
                                                <div className='sc-stat-row'><label>Over (5-9)</label><span className='value'>{analysis.overPct.toFixed(1)}%</span></div>
                                                <div className='sc-progress-wrapper'><div className='fill' style={{ width: `${analysis.overPct}%` }} /></div>
                                                <div className='sc-stat-row mt-4'><label>Trend</label><span className='text-xs font-bold'>{analysis.overPct > 50 ? 'BULLISH OVER' : 'BEARISH UNDER'}</span></div>
                                            </>
                                        )}
                                        {tradeType === 'MATCHES' && (
                                            <>
                                                <div className='sc-stat-row'><label>Hottest Digit</label><span className='value'>{analysis.matchesBest}</span></div>
                                                <div className='grid grid-cols-5 gap-1 mt-2'>
                                                    {Object.entries(analysis.freq).map(([d, f]) => (
                                                        <div key={d} className='text-[8px] text-center bg-black/40 rounded p-1'>
                                                            <div className='font-black'>{d}</div>
                                                            <div className='opacity-50'>{((f/120)*100).toFixed(0)}%</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        {tradeType === 'DIFFERS' && (
                                            <>
                                                <div className='sc-stat-row'><label>Avoid Digit</label><span className='value text-red-500'>{analysis.differsBest}</span></div>
                                                <div className='sc-stat-row'><label>Safety</label><span className='value'>{analysis.confidence.toFixed(1)}%</span></div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className='flex items-center justify-center h-20 opacity-20'>
                                        {isActive ? <div className='animate-pulse font-black text-xs'>SCANNING...</div> : <span className='text-[10px] uppercase font-black'>Pending</span>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Right: Pro Suggestion & Bot Controls ── */}
                <div className='flex flex-col gap-8'>
                    
                    {/* Suggestion Reactor */}
                    {bestSignal && (
                        <div className='sc-signal-banner' style={{ '--sc-accent': TRADE_TYPES.find(t => t.id === tradeType)?.color } as any}>
                            <div className='label'>PREMIUM SIGNAL DETECTED</div>
                            <div className='flex items-center gap-6'>
                                <div className='signal'>{bestSignal.signal}</div>
                                <div className='h-16 w-px bg-white/10' />
                                <div className='sc-best-signal__validity'>
                                    <div className='sc-v-label'>VALIDITY</div>
                                    <div className='sc-v-val'>{validity}s</div>
                                </div>
                            </div>
                            
                            <div className='sc-suggestion-banner w-full'>
                                <div className='label'>DIGIT CRACKER ADVICE</div>
                                {tradeType === 'OVERUNDER' ? (
                                    <div className='flex flex-col items-center gap-4'>
                                        <div className='flex gap-2'>
                                            {(Array.isArray(bestSignal.prediction) ? bestSignal.prediction : [bestSignal.prediction ?? 0]).map(d => (
                                                <button key={d} className={classNames('sc-digit-pill', { active: manualPrediction === d })} onClick={() => setManualPrediction(d)}>
                                                    {d}
                                                </button>
                                            ))}
                                        </div>
                                        <div className='text-[10px] font-black opacity-30 uppercase tracking-widest'>Select Barrier Manually</div>
                                    </div>
                                ) : (
                                    <div className='sc-signal-text-glow'>{bestSignal.entry}</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bot Panel */}
                    <div className='sc-card'>
                        <div className='grid grid-cols-2 gap-6'>
                            <div className='sc-bot-field'>
                                <label>Stake (USD)</label>
                                <input type='number' value={stake} onChange={e => setStake(parseFloat(e.target.value))} />
                            </div>
                            <div className='sc-bot-field'>
                                <label>Goal / Stop</label>
                                <div className='flex gap-2'>
                                    <input type='number' value={tp} onChange={e => setTp(parseFloat(e.target.value))} placeholder='TP' />
                                    <input type='number' value={sl} onChange={e => setSl(parseFloat(e.target.value))} placeholder='SL' />
                                </div>
                            </div>
                        </div>

                        <div className='flex gap-4 mt-6'>
                            <button className={classNames('flex-1 py-4 rounded-xl font-black uppercase text-sm border-2 transition-all', isScanning ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-blue-500 bg-blue-500/10 text-blue-500')} onClick={isScanning ? stopScan : runScan}>
                                {isScanning ? 'Stop Scanning' : 'Start Scanner'}
                            </button>
                            <button className={classNames('flex-[2] sc-run-btn', { running: isBotRunning })} onClick={() => setIsBotRunning(!isBotRunning)} disabled={!bestSignal}>
                                {isBotRunning ? 'Stop Trading' : 'Execute AI Strategy'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Bottom Trade Panel ── */}
            <div className='sc-bottom-panel' style={{ '--sc-accent': TRADE_TYPES.find(t => t.id === tradeType)?.color } as any}>
                <div className='sc-panel-tabs'>
                    <button className={classNames({ active: activePanelTab === 'SUMMARY' })} onClick={() => setActivePanelTab('SUMMARY')}><LayoutGrid className='inline mr-2 w-4' /> Summary</button>
                    <button className={classNames({ active: activePanelTab === 'TRANSACTIONS' })} onClick={() => setActivePanelTab('TRANSACTIONS')}><History className='inline mr-2 w-4' /> Transactions</button>
                    <button className={classNames({ active: activePanelTab === 'JOURNAL' })} onClick={() => setActivePanelTab('JOURNAL')}><FileText className='inline mr-2 w-4' /> Journal</button>
                </div>

                <div className='sc-panel-content'>
                    {activePanelTab === 'SUMMARY' && (
                        <div className='sc-summary-grid'>
                            <div className='sc-summary-item'><label>Trades</label><span>{botWins + botLosses}</span></div>
                            <div className='sc-summary-item'><label>Result</label><span className='won'>{botWins}W <small className='text-gray-500'>/</small> {botLosses}L</span></div>
                            <div className='sc-summary-item'><label>Total P/L</label><span className={classNames({ won: botPL > 0, lost: botPL < 0 })}>{currency} {botPL.toFixed(2)}</span></div>
                            <div className='sc-summary-item'>
                                <label>Win Rate</label>
                                <span>{((botWins / (botWins + botLosses || 1)) * 100).toFixed(0)}%</span>
                                <div className='w-full h-1 bg-gray-800 rounded-full mt-2 overflow-hidden'>
                                    <div className='h-full bg-green-500' style={{ width: `${(botWins / (botWins + botLosses || 1)) * 100}%` }} />
                                </div>
                            </div>
                        </div>
                    )}

                    {activePanelTab === 'TRANSACTIONS' && (
                        <div className='sc-table-container'>
                            <table className='sc-modern-table'>
                                <thead>
                                    <tr><th>Time</th><th>Market</th><th>Type</th><th>Result</th><th>Profit</th></tr>
                                </thead>
                                <tbody>
                                    {transactions.map(tx => (
                                        <tr key={tx.id}>
                                            <td className='text-gray-500 text-xs'>{tx.time}</td>
                                            <td>{tx.symbol}</td>
                                            <td className='uppercase text-[10px]'>{tx.type}</td>
                                            <td><span className={classNames('px-2 py-1 rounded text-[10px] font-black', tx.status === 'won' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500')}>{tx.status.toUpperCase()}</span></td>
                                            <td className={classNames('font-black', tx.profit > 0 ? 'text-green-500' : 'text-red-500')}>{tx.profit.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activePanelTab === 'JOURNAL' && (
                        <div className='flex flex-col gap-4'>
                            <textarea 
                                className='sc-journal-area' 
                                placeholder='Type your trading notes here...'
                                value={journalNote}
                                onChange={e => setJournalNote(e.target.value)}
                            />
                            <div className='flex justify-between items-center'>
                                <span className='text-[10px] text-gray-500 uppercase font-black'>Entries are saved locally</span>
                                <button className='sc-save-btn flex items-center gap-2'><Save size={16} /> Save Entry</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default SignalCentreTab;
