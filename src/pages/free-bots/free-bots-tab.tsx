import React from 'react';
import { observer } from 'mobx-react-lite';
import TechBackground from '@/components/shared_ui/tech-background/tech-background';
import { useFreeBots } from '@/hooks/use-free-bots';
import { useStore } from '@/hooks/useStore';
import './free-bots-tab.scss';

const BotCard = ({ bot, onLoad }: { bot: any; onLoad: (bot: any) => void }) => {
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
            : '124, 58, 237';
    };

    const rgbColor = hexToRgb(bot.color || '#818cf8');

    return (
        <div
            className='bot-card'
            style={
                {
                    '--bot-color': bot.color || '#818cf8',
                    '--bot-color-rgb': rgbColor,
                } as React.CSSProperties
            }
        >
            <div className='card-glow' />
            <div className='bot-card__top'>
                <div className='bot-card__icon'>
                    {bot.category === 'Official' ? '🌟' : 
                     bot.category === 'Hybrid' ? '⚡' : 
                     bot.category === 'Normal' ? '📦' : '🤖'}
                </div>
                {bot.isPremium && <span className='bot-card__badge'>Premium</span>}
                {bot.isNew && <span className='bot-card__badge bot-card__badge--new'>New</span>}
            </div>

            <div className='bot-card__body'>
                <h3 className='bot-card__title'>{bot.name}</h3>
                <p className='bot-card__tagline'>{bot.category} Strategy</p>
                <p className='bot-card__description'>{bot.description}</p>
            </div>

            <div className='bot-card__footer'>
                <button className='bot-card__btn' onClick={() => onLoad(bot)}>
                    Deploy Strategy
                </button>
            </div>
        </div>
    );
};

const FreeBotsTab = observer(() => {
    const { ui } = useStore();
    const { is_dark_mode_on } = ui;
    const { selectedCategory, setSelectedCategory, categories, filteredBots, loadBotToBuilder, isLoading } =
        useFreeBots();

    return (
        <div className={`free-bots-engine ${is_dark_mode_on ? 'free-bots-engine--dark' : ''}`}>
            <TechBackground />


            <div className='tab-viewport'>
                <div className='library-container'>
                    <div className='library-filters'>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                                onClick={() => setSelectedCategory(cat)}
                            >
                                {cat} Bots
                            </button>
                        ))}
                    </div>

                    <div className='library-grid'>
                        {filteredBots.map(bot => (
                            <BotCard key={bot.id} bot={bot} onLoad={loadBotToBuilder} />
                        ))}
                    </div>
                </div>
            </div>

            {isLoading && (
                <div className='loading-overlay'>
                    <div className='spinner' />
                    <p>Injecting XML Logic...</p>
                </div>
            )}
        </div>
    );
});

export default FreeBotsTab;
