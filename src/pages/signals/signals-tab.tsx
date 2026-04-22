import { useEffect, useState } from 'react';
import { Activity, Brain, RefreshCw, ShieldAlert, Target, Timer, Zap, BarChart3, ListOrdered, BookOpen, ChevronRight, Layers } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDeriv } from '@/hooks/use-deriv';
import { useStore } from '@/hooks/useStore';
import './signals-tab.scss';

const SignalCard = ({
    signal,
    isPro = false,
    onTrade,
    isBotActive = false,
}: {
    signal: any;
    isPro?: boolean;
    onTrade: (sig: any, isAuto?: boolean) => void;
    isBotActive?: boolean;
}) => {
    const [timeLeft, setTimeLeft] = useState(30);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => (prev > 0 ? prev - 1 : 30));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const getStatusClass = () => {
        if (signal.status === 'TRADE NOW') return 'signal-card--trade-now';
        if (signal.status === 'WAIT') return 'signal-card--wait';
        return 'signal-card--neutral';
    };

    return (
        <div className={`signal-card ${getStatusClass()} ${isPro ? 'signal-card--pro' : ''} ${isBotActive ? 'signal-card--active' : ''}`}>
            <div className='card-glow' />
            <div className='signal-card__header'>
                <span className='type'>{signal.type}</span>
                <span className='status-badge'>{isBotActive ? 'RUNNING' : signal.status}</span>
            </div>

            <div className='signal-card__metrics'>
                <div className='metric-row'>
                    <div className='label-group'>
                        <span>Power</span>
                        <span>{signal.probability.toFixed(1)}%</span>
                    </div>
                    <div className='progress-container'>
                        <div className='progress-bar' style={{ width: `${signal.probability}%` }} />
                    </div>
                </div>
                <div className='metric-row'>
                    <div className='label-group'>
                        <span>Confidence</span>
                        <span>{Math.round(signal.probability * 0.95)}%</span>
                    </div>
                    <div className='progress-container'>
                        <div
                            className='progress-bar'
                            style={{
                                width: `${signal.probability * 0.95}%`,
                                background: 'linear-gradient(90deg, #10b981, #3b82f6)',
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className='signal-card__body'>
                <div className='stat-row'>
                    <span className='label'>Probability</span>
                    <span className='value'>{signal.probability.toFixed(1)}%</span>
                </div>
                <div className='stat-row'>
                    <span className='label'>Recommendation</span>
                    <span className='value rec'>{signal.recommendation}</span>
                </div>
                <div className='entry-box'>
                    <span className='label'>Entry Rule</span>
                    <div className='rule-text'>{signal.entryCondition}</div>
                </div>
            </div>

            <div className='signal-card__footer'>
                <div className='timer-badge'>
                    <Timer size={12} />
                    <span>{timeLeft}s</span>
                </div>
                <div className='actions'>
                    <button 
                        className={`btn-start ${isBotActive ? 'active' : ''}`} 
                        onClick={() => onTrade(signal, true)}
                    >
                        {isBotActive ? (
                            <><div className='pulse-dot' /> RUNNING</>
                        ) : (
                            'AUTO START'
                        )}
                    </button>
                    <button className='btn-manual' onClick={() => onTrade(signal)}>
                        <Zap size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const SignalsTab = observer(() => {
    const { smart_trading } = useStore();
    const {
        connectionStatus,
        currentPrice,
        currentDigit,
        tickCount,
        analysis,
        signals,
        proSignals,
        aiPrediction,
        symbol,
        availableSymbols,
        connectionLogs,
        changeSymbol,
        changeHistoryLength,
        addLog,
    } = useDeriv('R_100', 120);

    const [activeBotSignals, setActiveBotSignals] = useState<Record<string, boolean>>({});
    const [botSettings, setBotSettings] = useState({
        stake: 1.0,
        ticks: 1,
        martingale: 2.0,
        tp: 10,
        sl: 10,
        bulk: 1,
        compound: false,
        alternate: false,
        alternateTo: [] as string[],
        martingaleEnabled: true,
    });

    const stopAll = () => {
        setActiveBotSignals({});
        // Any other stop logic
    };

    const [sessionStats, setSessionStats] = useState({
        consecutiveLosses: 0,
        currentStake: 1.0,
        totalPL: 0,
    });

    const handleTrade = (sig: any, isAuto = false) => {
        if (isAuto) {
            const isStarting = !activeBotSignals[sig.recommendation];
            if (isStarting) {
                setSessionStats(prev => ({ ...prev, currentStake: botSettings.stake, consecutiveLosses: 0 }));
            }
            setActiveBotSignals(prev => ({ ...prev, [sig.recommendation]: isStarting }));
            return;
        }

        executeTrade(sig, botSettings.stake);
    };

    const executeTrade = (sig: any, amt: number) => {
        let contract_type = '';
        const rec = sig.recommendation.toUpperCase();

        if (sig.type.includes('Even/Odd')) {
            contract_type = rec.includes('EVEN') ? 'DIGITEVEN' : 'DIGITODD';
        } else if (sig.type.includes('Over/Under')) {
            contract_type = rec.includes('OVER') ? 'DIGITOVER' : 'DIGITUNDER';
        } else if (sig.type.includes('Matches')) {
            contract_type = 'DIGITMATCH';
        } else if (sig.type.includes('Differs')) {
            contract_type = 'DIGITDIFF';
        } else if (sig.type.includes('Rise / Fall')) {
            contract_type = rec.includes('RISE') ? 'CALL' : 'PUT';
        }

        if (contract_type) {
            addLog(`[Execution] ${contract_type} trade triggered for ${sig.type}`);
            for (let i = 0; i < botSettings.bulk; i++) {
                smart_trading.executeManualTrade({
                    contract_type,
                    symbol,
                    stake: amt,
                    barrier: sig.targetDigit,
                });
            }
        }
    };

    // Advanced Bot Logic
    useEffect(() => {
        const activeKeys = Object.keys(activeBotSignals).filter(k => activeBotSignals[k]);
        if (activeKeys.length === 0 || currentDigit === null || !signals) return;

        const allSignals = [...proSignals, ...signals];
        activeKeys.forEach(sigRec => {
            const sig = allSignals.find(s => s.recommendation === sigRec);
            if (!sig) return;

            let conditionMet = false;
            const entryRule = sig.entryCondition.toLowerCase();

            // Strict Entry Logic
            if (entryRule.includes('digit')) {
                const match = entryRule.match(/digit (\d)/);
                if (match && currentDigit === parseInt(match[1])) conditionMet = true;
            } else if (entryRule.includes('consecutive')) {
                // For consecutive patterns, we'd need history. For now, we trust the status is 'TRADE NOW'
                if (sig.status === 'TRADE NOW') conditionMet = true;
            } else if (sig.status === 'TRADE NOW') {
                conditionMet = true;
            }

            if (conditionMet) {
                executeTrade(sig, sessionStats.currentStake);
            }
        });
    }, [currentDigit, activeBotSignals, proSignals, signals]);

    // Handle Martingale/Alternating after store updates trades
    useEffect(() => {
        if (smart_trading.manual_trade_history.length > 0) {
            const lastTrade = smart_trading.manual_trade_history[0];
            const isLoss = lastTrade.result === 'LOST';
            
            setSessionStats(prev => ({
                ...prev,
                totalPL: smart_trading.session_pl,
                consecutiveLosses: isLoss ? prev.consecutiveLosses + 1 : 0,
                currentStake: isLoss 
                    ? (botSettings.martingaleEnabled ? prev.currentStake * botSettings.martingale : botSettings.stake)
                    : (botSettings.compound ? botSettings.stake + lastTrade.profitLoss : botSettings.stake)
            }));

            if (isLoss && botSettings.alternate && botSettings.alternateTo.length > 0) {
                const currentIndex = botSettings.alternateTo.indexOf(activeStrategy);
                if (currentIndex !== -1) {
                    const nextIndex = (currentIndex + 1) % botSettings.alternateTo.length;
                    setActiveStrategy(botSettings.alternateTo[nextIndex]);
                }
            }
        }
    }, [smart_trading.manual_trade_history.length, smart_trading.session_pl]);

    const [showLogs, setShowLogs] = useState(false);
    const [activeStrategy, setActiveStrategy] = useState('matches');
    const [dashboardTab, setDashboardTab] = useState('summary');

    const strategies = [
        { id: 'evenodd', name: 'Even / Odd', icon: Layers, color: '#6366f1' },
        { id: 'overunder', name: 'Over / Under', icon: BarChart3, color: '#f59e0b' },
        { id: 'matches', name: 'Matches', icon: Target, color: '#a855f7' },
        { id: 'differs', name: 'Differs', icon: ShieldAlert, color: '#ec4899' },
        { id: 'risefall', name: 'Rise / Fall', icon: Activity, color: '#10b981' },
    ];

    if (!analysis) {
        return (
            <div className='signals-tab signals-tab--loading'>
                <div className='loading-content'>
                    <RefreshCw className='animate-spin' size={48} />
                    <h3>Initializing Analysis Engine...</h3>
                    <p>Collecting tick data from Deriv WebSocket ({tickCount}/20)</p>
                </div>
            </div>
        );
    }

    return (
        <div className='signals-tab'>
            <div className='signals-tab__header'>
                <div className='header-left'>
                    <div className='market-selector'>
                        <select value={symbol} onChange={e => changeSymbol(e.target.value)} className='premium-select'>
                            {availableSymbols.map((s: any) => (
                                <option key={s.symbol} value={s.symbol}>
                                    {s.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className='stat-group'>
                        <div className='stat-item'>
                            <span className='stat-label'>PRICE</span>
                            <span className='stat-value'>{currentPrice}</span>
                        </div>
                        <div className='stat-item'>
                            <span className='stat-label'>LAST DIGIT</span>
                            <span className='stat-value highlight'>{currentDigit}</span>
                        </div>
                    </div>
                </div>

                <div className='header-center'>
                    <div className='ticks-drawer'>
                        <div className='ticks-drawer__label'>TICKS HISTORY DEPTH</div>
                        <div className='ticks-drawer__container'>
                            {[25, 60, 120, 250, 500, 1000].map(t => (
                                <button 
                                    key={t} 
                                    className={`tick-select ${analysis?.maxTicks === t ? 'active' : ''}`}
                                    onClick={() => changeHistoryLength(t)}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className='header-right'>
                    <div className={`connection-status connection-status--${connectionStatus}`}>
                        <div className='dot' />
                        <span>{connectionStatus.toUpperCase()}</span>
                    </div>
                    <button className='stop-btn' onClick={stopAll}>
                        STOP ALL
                    </button>
                    <button className='icon-btn' onClick={() => setShowLogs(!showLogs)}>
                        <Activity size={20} />
                    </button>
                </div>
            </div>

            <div className='signals-tab__strategy-tabs'>
                {strategies.map(strat => (
                    <button
                        key={strat.id}
                        className={`strategy-btn ${activeStrategy === strat.id ? 'active' : ''}`}
                        onClick={() => setActiveStrategy(strat.id)}
                        style={{ '--strat-color': strat.color } as any}
                    >
                        <strat.icon size={18} />
                        <span>{strat.name}</span>
                        {activeStrategy === strat.id && <div className='active-indicator' />}
                    </button>
                ))}
            </div>

            <div className='signals-tab__bot-settings'>
                <div className='settings-row'>
                    <div className='setting-field'>
                        <label>Stake</label>
                        <input type='number' value={botSettings.stake} onChange={e => setBotSettings({...botSettings, stake: parseFloat(e.target.value)})} />
                    </div>
                    <div className='setting-field'>
                        <label>Ticks</label>
                        <input type='number' value={botSettings.ticks} onChange={e => setBotSettings({...botSettings, ticks: parseInt(e.target.value)})} />
                    </div>
                    <div className='setting-field'>
                        <label>Martingale</label>
                        <input type='number' value={botSettings.martingale} onChange={e => setBotSettings({...botSettings, martingale: parseFloat(e.target.value)})} />
                    </div>
                    <div className='setting-field'>
                        <label>Take Profit</label>
                        <input type='number' value={botSettings.tp} onChange={e => setBotSettings({...botSettings, tp: parseFloat(e.target.value)})} />
                    </div>
                    <div className='setting-field'>
                        <label>Stop Loss</label>
                        <input type='number' value={botSettings.sl} onChange={e => setBotSettings({...botSettings, sl: parseFloat(e.target.value)})} />
                    </div>
                    <div className='setting-field'>
                        <label>Bulk</label>
                        <input type='number' value={botSettings.bulk} onChange={e => setBotSettings({...botSettings, bulk: parseInt(e.target.value)})} />
                    </div>
                    <div className='setting-field'>
                        <label>Compounding</label>
                        <button className={`toggle ${botSettings.compound ? 'active' : ''}`} onClick={() => setBotSettings({...botSettings, compound: !botSettings.compound})}>
                            {botSettings.compound ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className='setting-field'>
                        <label>Alternate To</label>
                        <div className='alternate-selector'>
                            {strategies.map(s => (
                                <button 
                                    key={s.id}
                                    className={botSettings.alternateTo.includes(s.id) ? 'active' : ''}
                                    onClick={() => {
                                        const newAlt = botSettings.alternateTo.includes(s.id)
                                            ? botSettings.alternateTo.filter(id => id !== s.id)
                                            : [...botSettings.alternateTo, s.id];
                                        setBotSettings({...botSettings, alternateTo: newAlt, alternate: newAlt.length > 0});
                                    }}
                                >
                                    {s.name.split(' ')[0]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <section className='signals-tab__distribution'>
                <div className='section-title'>
                    <Brain size={20} />
                    <h3>Digits Distribution Grid</h3>
                </div>
                <div className='distribution-grid'>
                    {(() => {
                        const sorted = [...analysis.digitFrequencies].sort((a, b) => b.count - a.count);
                        const most = sorted[0]?.digit;
                        const second = sorted[1]?.digit;
                        const least = sorted[sorted.length - 1]?.digit;

                        return analysis.digitFrequencies.map((f) => (
                            <div 
                                key={f.digit} 
                                className={`dist-item ${f.digit === currentDigit ? 'current' : ''}`}
                                style={{
                                    '--bar-color': f.digit === most ? '#10b981' : f.digit === second ? '#3b82f6' : f.digit === least ? '#ef4444' : '#a855f7'
                                } as any}
                            >
                                <div className='dist-item__header'>
                                    <span className='digit'>{f.digit}</span>
                                    <span className='pct'>{f.percentage.toFixed(1)}%</span>
                                </div>
                                <div className='dist-item__bar-wrap'>
                                    <div className='bar' style={{ height: `${f.percentage * 3}px`, background: 'var(--bar-color)' }} />
                                    {f.digit === currentDigit && <div className='cursor' />}
                                </div>
                                <div className='dist-item__count'>{f.count}x</div>
                            </div>
                        ));
                    })()}
                </div>
            </section>

            <section className='signals-tab__section'>
                <div className='section-title'>
                    <Zap size={20} />
                    <h3>Live Trading Signals</h3>
                </div>
                <div className='signals-tab__signals-grid'>
                    {proSignals.map((sig, i) => (
                        <SignalCard 
                            key={`pro-${i}`} 
                            signal={sig} 
                            isPro 
                            onTrade={handleTrade} 
                            isBotActive={activeBotSignals[sig.recommendation]}
                        />
                    ))}
                    {signals.map((sig, i) => (
                        <SignalCard 
                            key={`reg-${i}`} 
                            signal={sig} 
                            onTrade={handleTrade} 
                            isBotActive={activeBotSignals[sig.recommendation]}
                        />
                    ))}
                    {signals.length === 0 && proSignals.length === 0 && (
                        <div className='empty-signals'>
                            <ShieldAlert size={48} />
                            <p>Analyzing market patterns... Waiting for high-probability signals.</p>
                        </div>
                    )}
                </div>
            </section>

            {aiPrediction && (
                <section className='signals-tab__ai-section'>
                    <div className='ai-predictor'>
                        <div className='ai-predictor__content'>
                            <div className='title-group'>
                                <Brain size={24} />
                                <h3>AI Pattern Prediction</h3>
                                <span className='ai-badge'>Neural Engine 2.0</span>
                            </div>
                            <p className='explanation'>{aiPrediction.explanation}</p>

                            <div className='ai-predictor__top-predictions'>
                                <div className='prediction-card prediction-card--primary'>
                                    <span className='rank'>Top Pick</span>
                                    <span className='digit'>{aiPrediction.topPrediction.digit}</span>
                                    <span className='confidence'>
                                        {aiPrediction.topPrediction.confidence}% Confidence
                                    </span>
                                </div>
                                <div className='prediction-card'>
                                    <span className='rank'>Second</span>
                                    <span className='digit'>{aiPrediction.secondPrediction.digit}</span>
                                    <span className='confidence'>
                                        {aiPrediction.secondPrediction.confidence}% Confidence
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className='ai-predictor__chart'>
                            <ResponsiveContainer width='100%' height='100%'>
                                <BarChart data={aiPrediction.predictions}>
                                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                                    <XAxis dataKey='digit' />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1e293b',
                                            border: 'none',
                                            borderRadius: '8px',
                                        }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Bar dataKey='probability' radius={[4, 4, 0, 0]}>
                                        {aiPrediction.predictions.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={
                                                    entry.digit === aiPrediction.topPrediction.digit
                                                        ? '#a855f7'
                                                        : '#6366f1'
                                                }
                                                fillOpacity={0.6}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>
            )}

            <section className='signals-tab__dashboard'>
                <div className='dashboard-header'>
                    <div className='tabs'>
                        <button
                            className={dashboardTab === 'summary' ? 'active' : ''}
                            onClick={() => setDashboardTab('summary')}
                        >
                            <BarChart3 size={16} /> Summary
                        </button>
                        <button
                            className={dashboardTab === 'transactions' ? 'active' : ''}
                            onClick={() => setDashboardTab('transactions')}
                        >
                            <ListOrdered size={16} /> Transactions
                        </button>
                        <button
                            className={dashboardTab === 'journal' ? 'active' : ''}
                            onClick={() => setDashboardTab('journal')}
                        >
                            <BookOpen size={16} /> Journal
                        </button>
                    </div>
                </div>

                <div className='dashboard-content'>
                    {dashboardTab === 'summary' && (
                        <div className='summary-view'>
                            <div className='summary-grid'>
                                <div className='summary-card'>
                                    <span className='label'>Total Wins</span>
                                    <span className='value win'>{smart_trading.wins}</span>
                                </div>
                                <div className='summary-card'>
                                    <span className='label'>Total Losses</span>
                                    <span className='value loss'>{smart_trading.losses}</span>
                                </div>
                                <div className='summary-card'>
                                    <span className='label'>Session P/L</span>
                                    <span className='value' style={{ color: smart_trading.session_pl >= 0 ? '#10b981' : '#ef4444' }}>
                                        {smart_trading.session_pl.toFixed(2)} USD
                                    </span>
                                </div>
                                <div className='summary-card'>
                                    <span className='label'>Win Rate</span>
                                    <span className='value'>
                                        {smart_trading.wins + smart_trading.losses > 0
                                            ? ((smart_trading.wins / (smart_trading.wins + smart_trading.losses)) * 100).toFixed(1)
                                            : '0.0'}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {dashboardTab === 'transactions' && (
                        <div className='transactions-view'>
                            <table className='transactions-table'>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Type</th>
                                        <th>Stake</th>
                                        <th>Result</th>
                                        <th>Profit/Loss</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {smart_trading.manual_trade_history.map((trade, i) => (
                                        <tr key={i}>
                                            <td>{new Date(trade.timestamp).toLocaleTimeString()}</td>
                                            <td>{trade.contractType}</td>
                                            <td>{trade.stake}</td>
                                            <td className={trade.result.toLowerCase()}>{trade.result}</td>
                                            <td className={trade.profitLoss >= 0 ? 'win' : 'loss'}>
                                                {trade.profitLoss.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                    {smart_trading.manual_trade_history.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className='empty'>No transactions yet</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {dashboardTab === 'journal' && (
                        <div className='journal-view'>
                            <div className='journal-logs'>
                                {connectionLogs.slice(-10).map((log: string, i: number) => (
                                    <div key={i} className='journal-entry'>
                                        <ChevronRight size={14} />
                                        <span>{log}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {showLogs && (
                <div className='signals-tab__logs'>
                    <div className='logs-header'>
                        <h4>Connection Logs</h4>
                        <button onClick={() => setShowLogs(false)}>Close</button>
                    </div>
                    <div className='logs-content'>
                        {connectionLogs.map((log: string, i: number) => (
                            <div key={i} className='log-entry'>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

export default SignalsTab;
