import { useMemo } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { useStore } from '@/hooks/useStore';
import './matches-killer.scss';

// ── Digit Intel Row ────────────────────────────────────────────────────────────
const DigitIntelRow = ({ stat, power, isLatest, ranksMost, ranks2nd, ranksLeast }: any) => {
    const isMost   = stat.digit === ranksMost;
    const is2nd    = stat.digit === ranks2nd;
    const isLeast  = stat.digit === ranksLeast;
    const isElite  = isMost || is2nd || isLeast;

    const rankColor = isMost ? '#FFD700' : is2nd ? '#C0C0C0' : isLeast ? '#ef4444' : 'transparent';
    const rankLabel = isMost ? 'MOST' : is2nd ? '2ND' : isLeast ? 'LEAST' : null;

    const status = stat.percentage > 14 ? 'avoid' : stat.percentage > 11 ? 'warn' : 'clean';
    const barWidth = Math.min(stat.percentage * 5, 100);
    const barColor = stat.is_increasing ? '#10b981' : '#ef4444';

    return (
        <div className={classNames('mkill-table-row', { 'is-latest': isLatest })}>
            <div className='mkill-digit-cell' style={{ color: isElite ? rankColor : '#fff' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 900 }}>{stat.digit}</span>
                {rankLabel && (
                    <span
                        className='mkill-rank-badge'
                        style={{ background: `${rankColor}22`, color: rankColor, border: `1px solid ${rankColor}55` }}
                    >
                        {rankLabel}
                    </span>
                )}
            </div>
            <div style={{ color: '#64748b', fontSize: '0.7rem' }}>#{stat.rank}</div>
            <div style={{ color: stat.is_increasing ? '#10b981' : '#ef4444', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700 }}>
                {stat.is_increasing ? '▲' : '▼'} {stat.percentage.toFixed(1)}%
            </div>
            <div><span className={`mkill-status-badge ${status}`}>{status}</span></div>
            <div className='mkill-power-bar'>
                <div className='mkill-power-fill' style={{ width: `${barWidth}%`, background: barColor }} />
            </div>
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const MatchesKiller = observer(() => {
    const { marketkiller } = useStore();
    const { digit_stats, digit_power_scores, matches_settings, matches_ranks, ticks } = marketkiller;

    const last25 = useMemo(() => ticks.slice(-25).reverse(), [ticks]);

    const toggleCondition = (index: number) => {
        const next = [...matches_settings.enabled_conditions];
        next[index] = !next[index];
        runInAction(() => { marketkiller.matches_settings.enabled_conditions = next; });
    };

    const verificationStage = useMemo(() => {
        const enabled = matches_settings.enabled_conditions;
        if (!enabled.some(Boolean)) return 0;
        return enabled.filter(Boolean).length;
    }, [matches_settings.enabled_conditions]);

    const conditions = [
        { id: 1, key: 'C1: MANUAL RADAR',    desc: 'Trade manually locked predictions only' },
        { id: 2, key: 'C2: MOMENTUM GATE',   desc: 'Power acceleration must be positive' },
        { id: 3, key: 'C3: DOUBLE-HOLD',      desc: 'Confirm power increase two ticks in a row' },
        { id: 4, key: 'C4: POWER COMPARE',   desc: null, hasConfig: 'c4' },
        { id: 5, key: 'C5: TRIO-RANK SYNC',  desc: 'Auto-target Most, 2nd, and Least digits' },
        { id: 6, key: 'C6: RANK SEQUENCE',   desc: null, hasConfig: 'c6' },
    ];

    return (
        <div className='mkill-wrapper'>
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className='mkill-header'>
                <h2>Matches Killer</h2>
                <div
                    className={classNames('mkill-auto-toggle', { active: matches_settings.is_auto })}
                    onClick={() => runInAction(() => { marketkiller.matches_settings.is_auto = !matches_settings.is_auto; })}
                >
                    <div className={classNames('mkill-dot', { on: matches_settings.is_auto })} />
                    AUTO-TARGETS
                </div>
            </div>

            {/* ── Entry Gate ──────────────────────────────────────────────────── */}
            <div className='mkill-panel'>
                <div className='mkill-panel__title'>Entry Gate — 6-Stage Verification</div>
                <div className='mkill-gate'>
                    <div className='mkill-gate-stages'>
                        {[1, 2, 3, 4, 5, 6].map(s => (
                            <div
                                key={s}
                                className={classNames('mkill-stage-dot', { active: matches_settings.enabled_conditions[s - 1] })}
                            >
                                {s}
                            </div>
                        ))}
                    </div>
                    <div className='mkill-gate-status'>
                        {verificationStage === 0
                            ? '⏸ All gates disabled — configure conditions below'
                            : `⚡ ${verificationStage} of 6 gates active — monitoring market`}
                    </div>
                </div>
            </div>

            {/* ── Main Split Layout ────────────────────────────────────────────── */}
            <div className='mkill-split'>
                {/* ── Left: Digit Intel Table ─────────────────────────────────── */}
                <div className='mkill-panel'>
                    <div className='mkill-panel__title'>Digit Intelligence Radar</div>
                    <div className='mkill-intel-table'>
                        <div className='mkill-table-head'>
                            <span>Digit</span>
                            <span>Rank</span>
                            <span>Power</span>
                            <span>Status</span>
                            <span>Strength</span>
                        </div>
                        {digit_stats
                            .slice()
                            .sort((a, b) => a.rank - b.rank)
                            .map((s, i) => (
                                <DigitIntelRow
                                    key={s.digit}
                                    stat={s}
                                    power={digit_power_scores[i]}
                                    isLatest={s.digit === ticks[ticks.length - 1]}
                                    ranksMost={matches_ranks.most}
                                    ranks2nd={matches_ranks.second}
                                    ranksLeast={matches_ranks.least}
                                />
                            ))}
                    </div>
                </div>

                {/* ── Right: Controls ─────────────────────────────────────────── */}
                <div className='mkill-controls'>
                    {/* Prediction Tunnels */}
                    <div className='mkill-panel'>
                        <div className='mkill-panel__title'>Prediction Tunnels</div>
                        <div className='mkill-prediction-slots'>
                            {[0, 1, 2].map(idx => (
                                <div key={idx} className='mkill-slot'>
                                    <label>#{idx + 1}</label>
                                    <input
                                        type='number'
                                        min='0' max='9'
                                        disabled={matches_settings.is_auto}
                                        value={matches_settings.predictions[idx] ?? 0}
                                        onChange={e => {
                                            const val = parseInt(e.target.value);
                                            const next = [...matches_settings.predictions];
                                            next[idx] = isNaN(val) ? 0 : val;
                                            runInAction(() => { marketkiller.matches_settings.predictions = next; });
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.6rem', fontStyle: 'italic' }}>
                            {matches_settings.is_auto ? '⚡ Automated Discovery Active' : '🎯 Manual Targeting Active'}
                        </div>
                    </div>

                    {/* Strategy Controls */}
                    <div className='mkill-panel'>
                        <div className='mkill-panel__title'>Strategy Controls</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div className='mkill-control-row'>
                                <label>Stake ($)</label>
                                <input
                                    type='number' step='0.5'
                                    value={matches_settings.stake}
                                    onChange={e => runInAction(() => { marketkiller.matches_settings.stake = parseFloat(e.target.value); })}
                                />
                            </div>
                            <div className='mkill-control-row'>
                                <label>Simultaneous Trades</label>
                                <input
                                    type='number' min='1' max='3'
                                    value={matches_settings.simultaneous_trades}
                                    onChange={e => runInAction(() => { marketkiller.matches_settings.simultaneous_trades = parseInt(e.target.value); })}
                                />
                            </div>
                            <div
                                className='mkill-toggle-row'
                                onClick={() => runInAction(() => { marketkiller.matches_settings.martingale_enabled = !matches_settings.martingale_enabled; })}
                            >
                                <span>Use Martingale Recovery</span>
                                <div className={classNames('mkill-switch', { on: matches_settings.martingale_enabled })} />
                            </div>
                            {matches_settings.martingale_enabled && (
                                <div className='mkill-control-row'>
                                    <label>Multiplier (×)</label>
                                    <input
                                        type='number' step='0.1'
                                        value={matches_settings.martingale_multiplier}
                                        onChange={e => runInAction(() => { marketkiller.matches_settings.martingale_multiplier = parseFloat(e.target.value); })}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Verification Gates */}
                    <div className='mkill-panel'>
                        <div className='mkill-panel__title'>Verification Gates</div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {conditions.map((cond, idx) => (
                                <div key={cond.id}>
                                    <div className='mkill-toggle-row' onClick={() => toggleCondition(idx)}>
                                        <span>{cond.key}</span>
                                        <div className={classNames('mkill-switch', { on: matches_settings.enabled_conditions[idx] })} />
                                    </div>
                                    {/* C4 sub-config */}
                                    {cond.hasConfig === 'c4' && matches_settings.enabled_conditions[idx] && (
                                        <div className='mkill-sub-config'>
                                            <select
                                                value={matches_settings.c4_op}
                                                onChange={e => runInAction(() => { marketkiller.matches_settings.c4_op = e.target.value; })}
                                            >
                                                <option value='>='>{'≥'}</option>
                                                <option value='=='>{'='}</option>
                                                <option value='<='>{'≤'}</option>
                                                <option value='>'>{'>'}</option>
                                                <option value='<'>{'<'}</option>
                                            </select>
                                            <input
                                                type='number'
                                                value={matches_settings.c4_val}
                                                onChange={e => runInAction(() => { marketkiller.matches_settings.c4_val = parseInt(e.target.value); })}
                                            />
                                            <span>%</span>
                                        </div>
                                    )}
                                    {/* C6 sub-config */}
                                    {cond.hasConfig === 'c6' && matches_settings.enabled_conditions[idx] && (
                                        <div className='mkill-sub-config'>
                                            <input
                                                type='number'
                                                value={matches_settings.c6_count}
                                                onChange={e => runInAction(() => { marketkiller.matches_settings.c6_count = parseInt(e.target.value); })}
                                            />
                                            <select
                                                value={matches_settings.c6_target_rank}
                                                onChange={e => runInAction(() => { marketkiller.matches_settings.c6_target_rank = e.target.value as any; })}
                                            >
                                                <option value='most'>Most</option>
                                                <option value='2nd'>2nd</option>
                                                <option value='least'>Least</option>
                                            </select>
                                            <span>ticks</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Live Tick Stream ─────────────────────────────────────────────── */}
            <div className='mkill-panel'>
                <div className='mkill-panel__title'>Live Entry Stream — Last 25 Ticks</div>
                <div className='mkill-tick-stream'>
                    {last25.map((t, i) => (
                        <div
                            key={i}
                            className={classNames('mkill-tick-chip', {
                                'chip-latest': i === 0,
                                'chip-most':   t === matches_ranks.most   && i !== 0,
                                'chip-second': t === matches_ranks.second && i !== 0,
                                'chip-least':  t === matches_ranks.least  && i !== 0,
                            })}
                        >
                            {t}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Execution ────────────────────────────────────────────────────── */}
            <div className='mkill-panel'>
                <div className='mkill-panel__title'>Execution</div>
                <div className='mkill-exec-btns'>
                    <button
                        className={classNames('mkill-btn-primary', { active: matches_settings.is_running })}
                        onClick={() => runInAction(() => { marketkiller.matches_settings.is_running = !matches_settings.is_running; })}
                    >
                        {matches_settings.is_running ? '⏹ STOP KILLER ENGINE' : '▶ ACTIVATE KILLER ENGINE'}
                    </button>
                    <button className='mkill-btn-secondary'>
                        ONE-SHOT
                    </button>
                </div>
            </div>
        </div>
    );
});

export default MatchesKiller;
