import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import * as Tone from 'tone';
import { fetchContributions } from '../services/contributions';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useSequencer } from '../hooks/useSequencer';
import './EmbedWidget.css';

const DayCell = memo(({ day, isPlaying }) => (
    <div
        className={`embed-day-cell level-${day.level} ${isPlaying ? 'playing' : ''}`}
        title={`${day.date}: ${day.count} contribs`}
    />
));

const WeekCol = memo(React.forwardRef(({ week, weekIndex, isActive, activeNotes }, ref) => (
    <div ref={ref} className={`embed-week-col ${isActive ? 'active' : ''}`}>
        {week.days.map((day, dIndex) => (
            <DayCell
                key={dIndex}
                day={day}
                isPlaying={isActive && activeNotes.includes(dIndex)}
            />
        ))}
    </div>
)));

const EmbedWidget = () => {
    const [username, setUsername] = useState('');
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [platform, setPlatform] = useState('github');
    const [showLink, setShowLink] = useState(true);
    const widgetRef = useRef(null);

    const audioEngine = useAudioEngine(username, { melody: -10, pad: -20, drum: -4, metal: -14 }, data);
    const sequencer = useSequencer(audioEngine, username);

    // Send height to parent for auto-resize iframe
    useEffect(() => {
        const sendHeight = () => {
            if (widgetRef.current) {
                const height = widgetRef.current.scrollHeight;
                window.parent.postMessage({ type: 'gitmusic-resize', height }, '*');
            }
        };

        // Send initial height
        sendHeight();

        // Send height on resize
        const resizeObserver = new ResizeObserver(sendHeight);
        if (widgetRef.current) {
            resizeObserver.observe(widgetRef.current);
        }

        return () => resizeObserver.disconnect();
    }, [data, showLink]);

    const { isPlaying, activeCol, activeNotes, toggle, stop } = sequencer;

    // Refs for auto-scroll
    const graphRef = useRef(null);
    const activeWeekRef = useRef(null);

    // Auto-scroll graph to follow playback
    useEffect(() => {
        if (activeCol !== null && activeWeekRef.current && graphRef.current) {
            const container = graphRef.current;
            if (container.scrollWidth > container.clientWidth) {
                const containerRect = container.getBoundingClientRect();
                const activeRect = activeWeekRef.current.getBoundingClientRect();

                const relativeLeft = activeRect.left - containerRect.left;
                const scrollLeft = container.scrollLeft;

                const targetLeft = scrollLeft + relativeLeft - (container.clientWidth / 2) + (activeRect.width / 2);

                container.scrollTo({
                    left: targetLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeCol]);

    // Load user from URL on mount
    useEffect(() => {
        const pathname = window.location.pathname;
        // Expected format: /embed/username
        const parts = pathname.split('/').filter(Boolean);
        const params = new URLSearchParams(window.location.search);
        const queryPlatform = params.get('platform');
        const hideLink = params.get('hideLink');

        if (queryPlatform) {
            setPlatform(queryPlatform);
        }

        // Check if link should be hidden
        if (hideLink === 'true' || hideLink === '1') {
            setShowLink(false);
        }

        // Get username from path: /embed/username
        if (parts.length >= 2 && parts[0] === 'embed') {
            const user = parts[1];
            setUsername(user);
            loadData(user, queryPlatform);
        } else {
            setError('No username provided');
            setIsLoading(false);
        }
    }, []);

    const loadData = async (user, format = null) => {
        setIsLoading(true);
        setError(null);

        const result = await fetchContributions(user, format || 'github');

        if (result.error) {
            setError(result.error);
        } else {
            setData(result.data);
        }

        setIsLoading(false);
    };

    const handleTogglePlay = useCallback(async () => {
        await Tone.start();
        toggle(data);
    }, [toggle, data]);

    const hasNoContributions = data && data.weeks.every(w => w.days.every(d => d.level === 0));

    if (isLoading) {
        return (
            <div className="embed-widget">
                <div className="embed-header">
                    <span className="embed-logo">GitMusic</span>
                </div>
                <div className="embed-loading">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="embed-widget">
                <div className="embed-header">
                    <span className="embed-logo">GitMusic</span>
                </div>
                <div className="embed-error">{error}</div>
            </div>
        );
    }

    return (
        <div className="embed-widget" ref={widgetRef}>
            {/* Header with username */}
            <div className="embed-header">
                <div className="embed-brand">
                    <img src="https://gitmusic.niyasv.com/favicon.png" alt="" className="embed-favicon" />
                    <span className="embed-title">GitMusic</span>
                </div>
                <span className="embed-username">@{username}</span>
            </div>

            {/* Contribution Graph */}
            <div className="embed-graph" ref={graphRef}>
                {data && (
                    <div className="embed-graph-grid">
                        {data.weeks.map((week, wIndex) => (
                            <WeekCol
                                key={wIndex}
                                ref={activeCol === wIndex ? activeWeekRef : null}
                                week={week}
                                weekIndex={wIndex}
                                isActive={activeCol === wIndex}
                                activeNotes={activeCol === wIndex ? activeNotes : []}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Controls: Play button left, Link right */}
            <div className="embed-controls">
                <button
                    className={`embed-ctrl-btn ${isPlaying ? 'active' : ''}`}
                    onClick={handleTogglePlay}
                    disabled={!data || hasNoContributions}
                >
                    {isPlaying ? (
                        <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                            </svg>
                            <span>Stop</span>
                        </>
                    ) : (
                        <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            <span>Play</span>
                        </>
                    )}
                </button>
                {showLink && (
                    <a href={`https://gitmusic.niyasv.com/${username}`} target="_blank" rel="noopener noreferrer" className="embed-link">
                        gitmusic.niyasv.com
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                )}
            </div>
        </div>
    );
};

export default EmbedWidget;
