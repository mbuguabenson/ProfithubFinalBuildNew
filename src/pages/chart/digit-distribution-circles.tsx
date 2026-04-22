import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import './digit-distribution-circles.scss';

interface DigitStats {
    digit: number;
    count: number;
    percentage: number;
}

interface DistributionProps {
    onSelect?: (digit: number) => void;
    selected_digit?: number | null;
}

const DigitDistributionCircles = observer(({ onSelect, selected_digit }: DistributionProps) => {
    const { smart_trading } = useStore();
    const { ticks } = smart_trading;

    const digitStats: DigitStats[] = useMemo(() => {
        const counts = Array(10).fill(0);
        ticks.forEach(digit => {
            if (digit >= 0 && digit <= 9) counts[digit]++;
        });
        const total = ticks.length || 1;
        return counts.map((count, digit) => ({
            digit,
            count,
            percentage: (count / total) * 100,
        }));
    }, [ticks]);

    const mostAppearing = useMemo(() => {
        if (digitStats.length === 0) return { digit: -1, count: 0, percentage: 0 };
        return digitStats.reduce((max, stat) => (stat.count > max.count ? stat : max), digitStats[0]);
    }, [digitStats]);

    const leastAppearing = useMemo(() => {
        if (digitStats.length === 0) return { digit: -1, count: 0, percentage: 0 };
        return digitStats.reduce((min, stat) => (stat.count < min.count ? stat : min), digitStats[0]);
    }, [digitStats]);

    const currentDigit = smart_trading.last_digit;

    const getCircleClass = (digit: number) => {
        if (digit === selected_digit) return 'circle--selected';
        if (digit === currentDigit) return 'circle--current';
        if (digit === mostAppearing.digit) return 'circle--most';
        if (digit === leastAppearing.digit) return 'circle--least';
        return 'circle--normal';
    };

    return (
        <div className='digit-distribution-circles-v2'>
            <div className='distribution-title-group'>
                <h3 className='distribution-title'>
                    <Localize i18n_default_text='Digit Distribution' />
                </h3>
                <div className='distribution-title-underline'></div>
            </div>

            <div className='circles-row'>
                {digitStats.map(({ digit, percentage }) => (
                    <div key={digit} className='digit-item-container' onClick={() => onSelect?.(digit)}>
                        <div className={`digit-ring ${getCircleClass(digit)}`}>
                            {digit === currentDigit && (
                                <div className='ring-arrow'>
                                    <span className='arrow-triangle'>▼</span>
                                </div>
                            )}
                            <div className='ring-inner'>
                                <span className='digit-val'>{digit}</span>
                            </div>
                            <svg className='ring-svg' viewBox='0 0 40 40'>
                                <circle className='ring-base' cx='20' cy='20' r='18' />
                                <circle
                                    className='ring-progress'
                                    cx='20'
                                    cy='20'
                                    r='18'
                                    style={{ strokeDasharray: `${(percentage / 100) * 113} 113` }}
                                />
                            </svg>
                        </div>
                        <div className={`digit-percentage-badge ${getCircleClass(digit)}`}>
                            {percentage.toFixed(1)}%
                        </div>
                    </div>
                ))}
            </div>

            <div className='distribution-legend-v2'>
                <span className='legend-label'>
                    <Localize i18n_default_text='Highest: ' />
                </span>
                <span className='legend-value highest'>{mostAppearing.percentage.toFixed(2)}%</span>
                <span className='legend-divider'> | </span>
                <span className='legend-label'>
                    <Localize i18n_default_text='Lowest: ' />
                </span>
                <span className='legend-value lowest'>{leastAppearing.percentage.toFixed(2)}%</span>
            </div>
        </div>
    );
});

export default DigitDistributionCircles;
