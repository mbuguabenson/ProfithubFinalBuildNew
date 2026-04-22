import React from 'react';
import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import DashboardBotList from './bot-list/dashboard-bot-list';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';

const RiskDisclaimerModal = React.lazy(() => import('@/components/shared/risk-disclaimer-modal'));

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client } = useStore();
    const { isDesktop, isTablet } = useDevice();
    const [search_query, setSearchQuery] = React.useState('');
    const [is_risk_modal_open, setIsRiskModalOpen] = React.useState(false);
    const has_dashboard_strategies = !!load_modal.dashboard_strategies?.length;

    return (
        <div className='dashboard-container'>
            <div className='dashboard-content'>
                {/* Hero Section / Welcome Header */}
                <header className='dashboard-hero'>
                    <div className='hero-bg-blobs'>
                        <div className='blob blob-1' />
                        <div className='blob blob-2' />
                        <div className='blob blob-3' />
                    </div>

                    <div className='hero-text'>
                        <div className='hero-badge'>{localize('Platform of Choice')}</div>
                        <Text as='h1' color='prominent' size={isDesktop ? 'xl' : 'm'} weight='bold'>
                            {localize('Welcome back,')}{' '}
                            {client.account_settings?.first_name || client.loginid || localize('Trader')}!
                        </Text>
                        <Text as='p' color='prominent' size={isDesktop ? 's' : 'xs'}>
                            {localize(
                                'Your next successful trade starts here. What would you like to build or trade today?'
                            )}
                        </Text>

                        <div className='hero-actions'>
                            <Button
                                className='hero-load-button'
                                has_effect
                                text={localize('Load Bot')}
                                onClick={() => load_modal.toggleLoadModal()}
                                primary
                                large={isDesktop}
                                medium={!isDesktop}
                            />
                            <Button
                                className='hero-learn-button'
                                has_effect
                                text={localize('Get Started')}
                                onClick={() => handleTabChange(17)} // Redirect to Strategies tab
                                tertiary
                                large={isDesktop}
                                medium={!isDesktop}
                            />
                            <Button
                                className='hero-whatsapp-button'
                                has_effect
                                text={localize('Inquiry')}
                                icon={<span className='whatsapp-icon'>💬</span>}
                                onClick={() =>
                                    window.open(
                                        'https://api.whatsapp.com/send/?phone=254796428848&text&type=phone_number&app_absent=0',
                                        '_blank'
                                    )
                                }
                                tertiary
                                large={isDesktop}
                                medium={!isDesktop}
                            />
                        </div>
                    </div>

                    <div className='dashboard-market-stats'>
                        <div className='stat-item'>
                            <span className='stat-label'>{localize('Active Markets')}</span>
                            <span className='stat-value'>24/7</span>
                        </div>
                        <div className='stat-item'>
                            <span className='stat-label'>{localize('Live Trades')}</span>
                            <span className='stat-value'>+12k</span>
                        </div>
                        <div className='stat-divider' />
                        <div className='dashboard-search'>
                            <div className='search-wrapper'>
                                <span className='search-icon'>🔍</span>
                                <input
                                    type='text'
                                    placeholder={localize('Search tools...')}
                                    value={search_query}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className='search-input'
                                />
                            </div>
                        </div>
                        <div className='stat-divider' />
                        <Button
                            className='dashboard-risk-button'
                            transparent
                            text={localize('Risk disclaimer')}
                            onClick={() => setIsRiskModalOpen(true)}
                        />
                    </div>
                </header>

                {/* Announcements Section */}
                {client.is_logged_in && (
                    <div className='announcements-wrapper'>
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    </div>
                )}

                {/* Main Action Grid */}
                <main className='dashboard-grid-container'>
                    <Cards
                        has_dashboard_strategies={has_dashboard_strategies}
                        is_mobile={!isDesktop}
                        search_query={search_query}
                        handleTabChange={handleTabChange}
                    />
                </main>

                {/* Recent Strategies Section */}
                {has_dashboard_strategies && (
                    <section className='recent-strategies-section'>
                        <div className='section-header'>
                            <Text as='h2' color='prominent' weight='bold' size='sm'>
                                {localize('Recent Strategies')}
                            </Text>
                            <div className='header-line' />
                        </div>
                        <div className='recent-strategies-list'>
                            <DashboardBotList />
                        </div>
                    </section>
                )}
            </div>

            {/* Side Info Panel */}
            <InfoPanel />

            {/* Tours and Overlays */}
            {dashboard.active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
            {/* Risk Disclaimer */}
            <React.Suspense fallback={null}>
                <RiskDisclaimerModal is_open={is_risk_modal_open} onClose={() => setIsRiskModalOpen(false)} />
            </React.Suspense>
        </div>
    );
});

export default DashboardComponent;
