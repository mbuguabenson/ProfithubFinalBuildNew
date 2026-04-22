import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { Localize } from '@deriv-com/translations';
import { StandaloneGearRegularIcon, StandaloneChartAreaRegularIcon } from '@deriv/quill-icons';
import { useStore } from '@/hooks/useStore';
import './toolhub.scss';

const Toolhub = observer(() => {
    const { dashboard } = useStore();
    const { toolhub_selected_tool, setToolhubSelectedTool } = dashboard;

    const tools = {
        dtool: {
            name: 'Dtool',
            url: 'https://v0-tool2.vercel.app/',
        },
        profithub: {
            name: 'Profithub Tool',
            url: 'https://v0-profithubtool2026.vercel.app/',
        },
    };

    return (
        <div className='toolhub-container'>
            <div className='toolhub-header glass-card'>
                <div className='toolhub-nav'>
                    <button
                        className={classNames('tool-btn', { active: toolhub_selected_tool === 'dtool' })}
                        onClick={() => setToolhubSelectedTool('dtool')}
                    >
                        <StandaloneGearRegularIcon className='btn-icon' />
                        <Localize i18n_default_text='Dtool' />
                    </button>
                    <button
                        className={classNames('tool-btn', { active: toolhub_selected_tool === 'profithub' })}
                        onClick={() => setToolhubSelectedTool('profithub')}
                    >
                        <StandaloneChartAreaRegularIcon className='btn-icon' />
                        <Localize i18n_default_text='Profithub Tool' />
                    </button>
                </div>
                <div className='toolhub-status'>
                    <div className='status-dot' />
                    <Localize i18n_default_text='Toolhub Active' />
                </div>
            </div>

            <div className='toolview-wrapper glass-card'>
                <iframe
                    src={tools[toolhub_selected_tool].url}
                    title={tools[toolhub_selected_tool].name}
                    className='tool-iframe'
                    allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                    allowFullScreen
                />
            </div>
        </div>
    );
});

export default Toolhub;
