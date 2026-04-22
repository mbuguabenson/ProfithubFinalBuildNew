import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import TechBackground from '../shared_ui/tech-background/tech-background';
import './initial-loader.scss';

const LOADING_MESSAGES = [
    'Initializing Profithub Engine...',
    'Securing Quantum Gateway...',
    'Connecting to Global Markets...',
    'Calibrating Trading Algorithms...',
    'Decrypting Secure Session...',
];

export default function InitialLoader() {
    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const whatsappNumber = '+254796428848';
    const whatsappLink = `https://wa.me/${whatsappNumber.replace('+', '')}`;

    return (
        <div className='initial-loader-overlay'>
            <TechBackground />
            <div className='loader-background-glow' />

            <motion.div
                className='loader-content-wrap'
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className='logo-section'>
                    <motion.div
                        className='logo-glow-ring'
                        animate={{ rotate: 360 }}
                        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                    />
                    <div className='logo-container'>
                        <img src='/logo-ph.png' alt='Ph' className='main-logo-img' />
                        <h1 className='main-brand-title'>PROFITHUB</h1>
                    </div>
                </div>

                <div className='system-status-container'>
                    <div className='status-header'>
                        <span className='pulse-dot' />
                        <span className='status-label'>SYSTEM INITIALIZATION</span>
                    </div>

                    <div className='progress-meter'>
                        <motion.div
                            className='progress-fill'
                            initial={{ width: '0%' }}
                            animate={{ width: '100%' }}
                            transition={{ duration: 15, ease: 'linear' }}
                        />
                    </div>

                    <div className='message-carousel'>
                        {/* @ts-ignore */}
                        <AnimatePresence mode='wait'>
                            <motion.p
                                key={messageIndex}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.5 }}
                                className='loading-status-msg'
                            >
                                {LOADING_MESSAGES[messageIndex]}
                            </motion.p>
                        </AnimatePresence>
                    </div>
                </div>

                <motion.div
                    className='customer-care-cta'
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1, duration: 0.8 }}
                >
                    <a href={whatsappLink} target='_blank' rel='noopener noreferrer' className='whatsapp-support-btn'>
                        <span className='wa-icon'>💬</span>
                        <div className='wa-text'>
                            <span className='wa-label'>CUSTOMER CARE</span>
                            <span className='wa-number'>{whatsappNumber}</span>
                        </div>
                    </a>
                </motion.div>
            </motion.div>

            <div className='loader-footer-simple'>
                <span className='powered-tag'>POWERED BY DERIV TECHNOLOGY</span>
            </div>
        </div>
    );
}
