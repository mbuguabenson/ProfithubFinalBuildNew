import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import TechBackground from '../shared_ui/tech-background/tech-background';
import './initial-loader.scss';

const LOADING_MESSAGES = [
    'ESTABLISHING QUANTUM LINK',
    'SYNCING LIQUIDITY MATRIX',
    'DECRYPTING MARKET DATA',
    'CALIBRATING AI ENGINES',
    'PROFIT-MAXIMIZATION ACTIVE',
];

const DATA_STREAMS = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    duration: 5 + Math.random() * 10,
    delay: Math.random() * 5,
}));

export default function InitialLoader() {
    const [messageIndex, setMessageIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const msgInterval = setInterval(() => {
            setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
        }, 2500);

        const progInterval = setInterval(() => {
            setProgress(prev => (prev < 100 ? prev + 1 : 100));
        }, 150);

        return () => {
            clearInterval(msgInterval);
            clearInterval(progInterval);
        };
    }, []);

    const whatsappNumber = '+254796428848';
    const whatsappLink = `https://wa.me/${whatsappNumber.replace('+', '')}`;

    return (
        <div className='quantum-hud-overlay'>
            <TechBackground />
            
            {/* Binary Data Streams */}
            <div className='data-stream-layer'>
                {DATA_STREAMS.map(stream => (
                    <motion.div
                        key={stream.id}
                        className='binary-column'
                        style={{ left: stream.left }}
                        initial={{ y: '-100%' }}
                        animate={{ y: '200%' }}
                        transition={{
                            duration: stream.duration,
                            repeat: Infinity,
                            ease: 'linear',
                            delay: stream.delay,
                        }}
                    >
                        {Array.from({ length: 20 }).map((_, j) => (
                            <span key={j}>{Math.round(Math.random())}</span>
                        ))}
                    </motion.div>
                ))}
            </div>

            <div className='hud-main-container'>
                {/* HUD Corners */}
                <div className='hud-corner top-left' />
                <div className='hud-corner top-right' />
                <div className='hud-corner bottom-left' />
                <div className='hud-corner bottom-right' />

                <div className='hologram-hub'>
                    {/* Rotating Rings */}
                    <motion.div 
                        className='ring-outer'
                        animate={{ rotate: 360 }}
                        transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div 
                        className='ring-inner'
                        animate={{ rotate: -360 }}
                        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                    />
                    
                    <div className='hologram-core'>
                        <div className='brand-display'>
                            <span className='p-logo'>P</span>
                            <div className='text-wrap'>
                                <span className='main'>PROFITHUB</span>
                                <span className='sub'>TRADERS</span>
                            </div>
                        </div>
                        <div className='progress-percentage'>{progress}%</div>
                    </div>
                </div>

                <div className='hud-footer'>
                    <div className='status-line'>
                        <span className='label'>SYSTEM STATUS:</span>
                        <AnimatePresence exitBeforeEnter>
                            <motion.span
                                key={messageIndex}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className='value'
                            >
                                {LOADING_MESSAGES[messageIndex]}
                            </motion.span>
                        </AnimatePresence>
                    </div>

                    <div className='loading-bar-wrap'>
                        <div className='loading-bar-fill' style={{ width: `${progress}%` }} />
                    </div>

                    <div className='support-hud-cta'>
                        <a href={whatsappLink} target='_blank' rel='noopener noreferrer'>
                            <span className='icon'>⚡</span>
                            <span>SECURE SUPPORT: {whatsappNumber}</span>
                        </a>
                    </div>
                </div>
            </div>

            <div className='quantum-footer'>
                <span className='engine-id'>CORE-v4.0.2-STABLE</span>
                <span className='tech-stack'>POWERED BY DERIV TECHNOLOGY</span>
            </div>
        </div>
    );
}
