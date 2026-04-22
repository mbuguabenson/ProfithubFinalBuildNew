import './app-logo.scss';

export const AppLogo = () => {
    return (
        <div className='app-header__logo-container'>
            <div className='header-branding'>
                <img src='/logo-ph.png' alt='Ph' className='brand-logo-img' />
                <span className='brand-logo-text'>ProfitHub</span>
            </div>
        </div>
    );
};
