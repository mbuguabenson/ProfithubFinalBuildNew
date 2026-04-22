import { useEffect, useState } from 'react';
import { Activity, Brain, Download, RefreshCw, ShieldAlert, Target, Timer, Zap } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDeriv } from '@/hooks/use-deriv';
import { useStore } from '@/hooks/useStore';
import './signals-tab.scss';

const SignalCard = ({
    signal,
    isPro = false,
    onTrade,
}: {
    signal: any;
    isPro?: boolean;
    onTrade: (sig: any) => void;
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
        <div className={`signal-card ${getStatusClass()} ${isPro ? 'signal-card--pro' : ''}`}>
            <div className='card-glow' />
            <div className='signal-card__header'>
                <span className='type'>{signal.type}</span>
                <span className='status-badge'>{signal.status}</span>
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

            <div className='signal-card__info'>
                <div className='info-row'>
                    <span className='label'>Trade Explanation:</span>
                    <span className='text'>{signal.recommendation}</span>
                </div>
                <div className='info-row'>
                    <span className='label'>Entry Rule:</span>
                    <span className='text'>{signal.entryCondition}</span>
                </div>
            </div>

            <div className='signal-card__footer'>
                <div className='timer'>
                    <Timer size={14} />
                    <span>Expires in {timeLeft}s</span>
                </div>
                <button className='trade-btn' onClick={() => onTrade(signal)}>
                    <Zap size={14} />
                    Trade Now
                </button>
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
        exportData,
    } = useDeriv('R_100', 100);

    const handleTrade = (sig: any) => {
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
            smart_trading.executeManualTrade({
                contract_type,
                symbol,
                stake: smart_trading.speedbot_stake,
                barrier: sig.targetDigit,
            });
        }
    };

    const [showLogs, setShowLogs] = useState(false);

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
                    <div className='title-area'>
                        <h2>Signal Centre</h2>
                        <span className='version'>PRO v4.2</span>
                    </div>
                    <div className='market-selector'>
                        <select value={symbol} onChange={e => changeSymbol(e.target.value)} className='premium-select'>
                            {availableSymbols.map(s => (
                                <option key={s.symbol} value={s.symbol}>
                                    {s.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className='header-right'>
                    <div className='settings-group'>
                        <div className='setting-item'>
                            <label>STAKE</label>
                            <input
                                type='number'
                                value={smart_trading.speedbot_stake}
                                onChange={e => smart_trading.setSpeedbotStake(parseFloat(e.target.value))}
                            />
                        </div>
                        <div className='setting-item'>
                            <label>TAKE PROFIT</label>
                            <input
                                type='number'
                                value={smart_trading.take_profit}
                                onChange={e => smart_trading.setTakeProfit(parseFloat(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className={`connection-status connection-status--${connectionStatus}`}>
                        <div className='dot' />
                        <span>{connectionStatus.toUpperCase()}</span>
                    </div>
                    <button className='icon-btn' onClick={() => setShowLogs(!showLogs)}>
                        <Activity size={20} />
                    </button>
                </div>
            </div>

            <div className='signals-tab__stats-bar'>
                <div className='stat-card'>
                    <span className='label'>Current Price</span>
                    <span className='value'>{currentPrice}</span>
                </div>
                <div className='stat-card'>
                    <span className='label'>Last Digit</span>
                    <span className='value digit-highlight'>{currentDigit !== null ? currentDigit : '-'}</span>
                </div>
                <div className='stat-card'>
                    <span className='label'>Total Ticks</span>
                    <span className='value'>{tickCount}</span>
                </div>
                <div className='stat-card'>
                    <span className='label'>Power Index</span>
                    <span className='value' style={{ color: '#10b981' }}>
                        {analysis.powerIndex.gap.toFixed(1)}%
                    </span>
                </div>
            </div>

            <section className='signals-tab__section'>
                <div className='section-title'>
                    <Zap size={20} />
                    <h3>Live Trading Signals</h3>
                </div>
                <div className='signals-tab__signals-grid'>
                    {proSignals.map((sig, i) => (
                        <SignalCard key={`pro-${i}`} signal={sig} isPro onTrade={handleTrade} />
                    ))}
                    {signals.map((sig, i) => (
                        <SignalCard key={`reg-${i}`} signal={sig} onTrade={handleTrade} />
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

            {showLogs && (
                <div className='signals-tab__logs'>
                    <div className='logs-header'>
                        <h4>Connection Logs</h4>
                        <button onClick={() => setShowLogs(false)}>Close</button>
                    </div>
                    <div className='logs-content'>
                        {connectionLogs.map((log, i) => (
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
