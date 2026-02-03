import React, { useEffect, useState, useCallback, memo, useRef, forwardRef } from 'react';
import * as Tone from 'tone';
import { fetchContributions, fetchGitHubContributions, fetchGitLabContributions } from '../services/contributions';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useSequencer } from '../hooks/useSequencer';
import './GitSequencer.css';

// Memoized day cell to prevent unnecessary re-renders
const DayCell = memo(({ day, isPlaying }) => (
    <div
        className={`day-cell level-${day.level} ${isPlaying ? 'playing' : ''}`}
        title={`${day.date}: ${day.count} contribs`}
    />
));

// Memoized week column with forwardRef to allow scrolling to it
const WeekCol = memo(forwardRef(({ week, weekIndex, isActive, activeNotes, style }, ref) => (
    <div ref={ref} className={`week-col ${isActive ? 'active' : ''}`} style={style}>
        {week.days.map((day, dIndex) => (
            <DayCell
                key={dIndex}
                day={day}
                isPlaying={isActive && activeNotes.includes(dIndex)}
            />
        ))}
    </div>
)));

const GitSequencer = () => {
    const [username, setUsername] = useState('');
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [volumes, setVolumes] = useState({ melody: -10, pad: -20, drum: -4, metal: -14 });
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const canvasRef = useRef(null);
    const inputRef = useRef(null);
    const measureRef = useRef(null);
    const [cursorPos, setCursorPos] = useState(0);
    const [showCursor, setShowCursor] = useState(true);
    const [platform, setPlatform] = useState('github');

    // Custom hooks for audio
    const audioEngine = useAudioEngine(username, volumes, data);
    const sequencer = useSequencer(audioEngine, username);

    const {
        isPlaying,
        activeCol,
        activeNotes,
        scaleType,
        currentPattern,
        bpm,
        autoScale,
        toggle,
        stop,
        changeScale
    } = sequencer;

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // State for animation (separate from actual loading)
    const [isAnimating, setIsAnimating] = useState(false);

    // State for toast notification
    const [showToast, setShowToast] = useState(false);

    // State for embed modal
    const [showEmbed, setShowEmbed] = useState(false);

    // Auto-hide toast
    useEffect(() => {
        if (showToast) {
            const timer = setTimeout(() => setShowToast(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [showToast]);

    const loadData = async (user, format = null) => {
        setIsLoading(true);
        setIsAnimating(true);
        setError(null);

        // Start animation timer
        const animationTimer = new Promise(resolve => setTimeout(resolve, 3000));

        let resultData = null;
        let resultError = null;
        let finalPlatform = 'github';

        // Check if explicit platform is requested
        if (format) {
            finalPlatform = format;
            const result = await fetchContributions(user, format);
            resultData = result.data;
            resultError = result.error;
        } else {
            // AUTO DETECT: Fetch both and pick winner
            try {
                const [ghRes, glRes] = await Promise.all([
                    fetchGitHubContributions(user),
                    fetchGitLabContributions(user)
                ]);

                const getCount = (res) => {
                    if (!res || !res.data || res.error) return -1;
                    return res.data.weeks.reduce((acc, w) =>
                        acc + w.days.reduce((da, d) => da + d.count, 0), 0);
                };

                const ghCount = getCount(ghRes);
                const glCount = getCount(glRes);

                if (ghCount === -1 && glCount === -1) {
                    // Both failed
                    resultError = `User "${user}" not found on GitHub or GitLab`;
                } else if (glCount > ghCount) {
                    finalPlatform = 'gitlab';
                    resultData = glRes.data;
                    resultError = glRes.error;
                } else {
                    // GitHub wins (default if equal or gh exists and gl doesn't)
                    finalPlatform = 'github';
                    resultData = ghRes.data;
                    resultError = ghRes.error;
                }
            } catch (err) {
                console.error("Auto-detect failed", err);
                resultError = "Failed to load data";
            }
        }

        setData(resultData);
        setError(resultError);
        setPlatform(finalPlatform);
        setIsLoading(false);

        // Wait for animation
        await animationTimer;
        setIsAnimating(false);
    };

    const handleSearch = (e) => {
        e.preventDefault();

        const rawInput = username.trim();
        if (!rawInput) return;

        let targetUser = rawInput;
        let explicitPlatform = null;

        // Parse command line arguments
        const args = rawInput.split(/\s+/);
        const pIndex = args.findIndex(arg => arg === '-p' || arg === '--platform');

        if (pIndex !== -1 && pIndex + 1 < args.length) {
            const platformArg = args[pIndex + 1].toLowerCase();
            if (['github', 'gitlab'].includes(platformArg)) {
                explicitPlatform = platformArg;
                // Remove flag from user string
                const newArgs = args.filter((_, i) => i !== pIndex && i !== pIndex + 1);
                targetUser = newArgs.join(' ');
            }
        }

        if (!targetUser || targetUser.length < 2) return;

        inputRef.current?.blur();
        if (isPlaying) stop();

        // If we extracted a clean username, update input to match
        if (targetUser !== username) {
            setUsername(targetUser);
        }

        loadData(targetUser, explicitPlatform);
    };

    const handleScaleChange = (e) => {
        changeScale(e.target.value);
    };

    // Auto-scroll graph
    const graphSectionRef = useRef(null);
    const activeWeekRef = useRef(null);

    useEffect(() => {
        if (activeCol !== null && activeWeekRef.current && graphSectionRef.current) {
            // Check if user is on mobile/overflowing
            const section = graphSectionRef.current;
            if (section.scrollWidth > section.clientWidth) {
                // Scroll strictly to center active element
                const sectionRect = section.getBoundingClientRect();
                const activeRect = activeWeekRef.current.getBoundingClientRect();

                const relativeLeft = activeRect.left - sectionRect.left;
                const scrollLeft = section.scrollLeft;

                // Desired position: center of container
                const targetLeft = scrollLeft + relativeLeft - (section.clientWidth / 2) + (activeRect.width / 2);

                section.scrollTo({
                    left: targetLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeCol]);

    const handleTogglePlay = useCallback(() => {
        toggle(data);
    }, [toggle, data]);

    // Check if there are no contributions
    const hasNoContributions = data && data.weeks.every(w => w.days.every(d => d.level === 0));

    // Draw to hidden canvas for video export (exact mobile layout, HQ 1080x1920)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data) return;

        const ctx = canvas.getContext('2d');

        // Colors from CSS variables (exact match)
        const colors = {
            bg: '#0d0d0d',
            accent: '#f23400',
            text: '#aaaaaa',
            textDim: '#555555',
            textBright: '#ffffff',
            accentCyan: '#66cccc',
            accentYellow: '#dcdcaa',
            success: '#4ec9b0',
            level0: '#1a1a1a',
            level1: '#0e4429',
            level2: '#006d32',
            level3: '#26a641',
            level4: '#39d353',
        };

        // HQ resolution (3x scale for 1080p)
        const scale = 3;
        const CELL_SIZE = 10 * scale;
        const GAP = 3 * scale;

        // Full HD portrait (1080x1920)
        const canvasWidth = 1080;
        const canvasHeight = 1920;

        if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
        if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

        // Mobile CSS layout (consistent spacing throughout)
        // All content uses same horizontal padding from canvas edge
        const contentPadding = 16 * scale;  // 1rem - consistent for all elements
        const contentWidth = canvasWidth - contentPadding * 2;

        // Fieldset internal padding (matches mobile .header-fieldset padding)
        const fieldsetPaddingX = 16 * scale;  // 1rem
        const fieldsetPaddingY = 16 * scale;  // 0.75rem -> increased for breathing room

        // Vertical spacing (matches mobile CSS)
        const headerContentGap = 16 * scale;  // 1rem gap between ASCII and subtitle
        const fieldsetMarginBottom = 32 * scale;  // spacing after header
        const statusMarginTop = 8 * scale;  // 0.5rem
        const graphMarginTop = 24 * scale;  // 1.5rem

        // Font sizes
        const asciiFontSize = 9 * scale;
        const subtitleFontSize = 14 * scale;
        const commandFontSize = 15 * scale;
        const statusFontSize = 14 * scale;
        const legendTitleSize = 16 * scale;
        const legendVersionSize = 12 * scale;

        // Calculate fieldset content height
        const asciiLineHeight = asciiFontSize * 1.2;
        const asciiHeight = 4 * asciiLineHeight;
        const subtitleLineHeight = subtitleFontSize * 1.3;
        const subtitleLines = 2;  // "Turn your GitHub/GitLab contributions" + "into music"
        const subtitleHeight = subtitleLines * subtitleLineHeight;
        const fieldsetContentHeight = asciiHeight + headerContentGap + subtitleHeight;
        const fieldsetHeight = fieldsetPaddingY * 2 + fieldsetContentHeight;

        // Calculate total content height for vertical centering
        const commandLineHeight = commandFontSize;
        const statusLineHeight = statusFontSize;
        const gridHeight = 7 * (CELL_SIZE + GAP);

        const totalContentHeight =
            fieldsetHeight +
            fieldsetMarginBottom +
            commandLineHeight +
            statusMarginTop +
            statusLineHeight +
            graphMarginTop +
            gridHeight;

        // Vertical offset to center content
        const offsetY = (canvasHeight - totalContentHeight) / 2;

        // Background
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        let currentY = offsetY;

        // ===== FIELDSET HEADER =====
        const fieldsetX = contentPadding;
        const fieldsetWidth = contentWidth;

        // Fieldset border
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.roundRect(fieldsetX, currentY, fieldsetWidth, fieldsetHeight, 4 * scale);
        ctx.stroke();

        // Measure legend text widths dynamically
        const titleFont = `bold ${legendTitleSize}px monospace`;
        const versionFont = `${legendVersionSize}px monospace`;
        ctx.font = titleFont;
        const titleText = 'GitMusic';
        const titleWidth = ctx.measureText(titleText).width;
        ctx.font = versionFont;
        const versionText = 'v1.0.0';
        const versionWidth = ctx.measureText(versionText).width;
        const legendGap = 8 * scale;
        const legendPaddingH = 8 * scale;
        const totalLegendWidth = titleWidth + legendGap + versionWidth + legendPaddingH * 2;

        // Legend position (inside fieldset border, with margin from left edge)
        const legendX = fieldsetX + fieldsetPaddingX;
        const legendY = currentY - legendVersionSize / 2;

        // Legend background (covers border)
        ctx.fillStyle = colors.bg;
        ctx.fillRect(legendX - legendPaddingH, legendY - legendVersionSize / 2, totalLegendWidth, legendTitleSize + 4 * scale);

        // Legend text: "GitHub Music v1.0.0"
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.accent;
        ctx.font = titleFont;
        ctx.fillText(titleText, legendX, currentY);
        ctx.fillStyle = colors.textDim;
        ctx.font = versionFont;
        ctx.fillText(versionText, legendX + titleWidth + legendGap, currentY);
        ctx.textBaseline = 'alphabetic';

        // ASCII art (centered within fieldset content area)
        const fieldsetContentTop = currentY + fieldsetPaddingY;
        ctx.fillStyle = colors.accent;
        ctx.font = `${asciiFontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 0.8;
        const asciiLines = [
            '   ♫       ♪',
            ' ▄ █ ▄ █ ▄ █',
            ' █ █ █ █ █ █',
            ' ▀ ▀ ▀ ▀ ▀ ▀'
        ];
        const fieldsetCenterX = fieldsetX + fieldsetWidth / 2;
        asciiLines.forEach((line, i) => {
            ctx.fillText(line, fieldsetCenterX, fieldsetContentTop + i * asciiLineHeight);
        });
        ctx.globalAlpha = 1;

        // Subtitle (centered within fieldset, wrapped to two lines)
        const subtitleY = fieldsetContentTop + asciiHeight + headerContentGap;
        ctx.fillStyle = colors.accent;
        ctx.font = `bold ${subtitleFontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Turn your GitHub/GitLab contributions', fieldsetCenterX, subtitleY);
        ctx.fillText('into music', fieldsetCenterX, subtitleY + subtitleLineHeight);
        ctx.textBaseline = 'alphabetic';

        currentY += fieldsetHeight + fieldsetMarginBottom;

        // ===== COMMAND LINE (left-aligned with content padding) =====
        ctx.textAlign = 'left';
        ctx.fillStyle = colors.accentCyan;
        ctx.font = `${commandFontSize}px monospace`;
        const cmdX = contentPadding;
        ctx.fillText('$', cmdX, currentY);

        ctx.fillStyle = colors.accentYellow;
        const promptWidth = ctx.measureText('$ ').width;
        ctx.fillText('gitmusic fetch', cmdX + promptWidth, currentY);

        ctx.fillStyle = colors.textBright;
        const cmdWidth = ctx.measureText('gitmusic fetch ').width;
        ctx.fillText(username, cmdX + promptWidth + cmdWidth, currentY);

        currentY += commandLineHeight + statusMarginTop;

        // ===== STATUS MESSAGE (left-aligned with content padding) =====
        ctx.fillStyle = colors.success;
        ctx.font = `${statusFontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`✓ loaded ${data.weeks.length} weeks`, contentPadding, currentY);

        currentY += statusLineHeight + graphMarginTop;

        // ===== CONTRIBUTION GRID =====
        const gridTotalWidth = data.weeks.length * (CELL_SIZE + GAP);
        const visibleWidth = contentWidth;

        // Calculate scroll offset to center active column
        let scrollOffset = 0;
        if (activeCol !== null && gridTotalWidth > visibleWidth) {
            const activeX = activeCol * (CELL_SIZE + GAP);
            const centerOffset = visibleWidth / 2 - CELL_SIZE / 2;
            scrollOffset = Math.max(0, Math.min(activeX - centerOffset, gridTotalWidth - visibleWidth));
        }

        // Clip region for grid
        ctx.save();
        ctx.beginPath();
        ctx.rect(contentPadding, currentY, visibleWidth, gridHeight + 5 * scale);
        ctx.clip();

        // Draw Grid with scroll offset
        data.weeks.forEach((week, wIndex) => {
            const x = contentPadding + wIndex * (CELL_SIZE + GAP) - scrollOffset;

            // Skip if outside visible area
            if (x + CELL_SIZE < contentPadding || x > canvasWidth - contentPadding) return;

            week.days.forEach((day, dIndex) => {
                const y = currentY + dIndex * (CELL_SIZE + GAP);

                // Determine Color
                let color = colors.level0;
                if (day.level === 1) color = colors.level1;
                if (day.level === 2) color = colors.level2;
                if (day.level === 3) color = colors.level3;
                if (day.level === 4) color = colors.level4;

                // Playing Highlight
                if (activeCol === wIndex && activeNotes.includes(dIndex)) {
                    color = colors.textBright;
                    ctx.shadowColor = colors.textBright;
                    ctx.shadowBlur = 12 * scale;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.roundRect(x, y, CELL_SIZE, CELL_SIZE, 2 * scale);
                ctx.fill();
            });
        });

        ctx.restore();
        ctx.shadowBlur = 0;

        // ===== FOOTER WITH PRODUCTION LINK =====
        ctx.fillStyle = colors.textDim;
        ctx.font = `${13 * scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`gitmusic.niyasv.com`, canvasWidth / 2, canvasHeight - 40 * scale);

    }, [data, activeCol, activeNotes, username]);

    // Export VIDEO recording (Universal Canvas Capture)
    const handleExport = async () => {
        if (isRecording) {
            // STOP RECORDING
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
            stop(); // Always stop playback when recording ends
        } else {
            // START RECORDING
            try {
                // 1. Get Canvas Stream (30 FPS)
                const canvas = canvasRef.current;
                const canvasStream = canvas.captureStream(30);

                // 2. Get Tone.js Audio Stream
                const audioDest = Tone.context.createMediaStreamDestination();
                Tone.getDestination().connect(audioDest);
                await Tone.start();
                const toneStream = audioDest.stream;

                // 3. Merge Streams
                const tracks = [
                    ...canvasStream.getVideoTracks(),
                    ...toneStream.getAudioTracks()
                ];
                const combinedStream = new MediaStream(tracks);

                // 4. Setup Recorder
                // Try to find supported mime type (Prioritize MP4)
                let mimeType = 'video/mp4; codecs=h264,aac';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm; codecs=vp9';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm';
                }

                const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 8000000 }); // 8Mbps for HQ
                mediaRecorderRef.current = recorder;
                chunksRef.current = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunksRef.current.push(e.data);
                };

                recorder.onstop = async () => {
                    const blob = new Blob(chunksRef.current, { type: mimeType });

                    // Determine extension
                    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                    const filename = `git-music-${username}.${ext}`;
                    const file = new File([blob], filename, { type: mimeType });

                    // Try Web Share API (Mobile Only)
                    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

                    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
                        try {
                            await navigator.share({
                                files: [file],
                                title: 'Git Music',
                                text: `Check out my year in code music! 🎵\nGenerated by Git Music.`,
                                url: window.location.href // Include link to app
                            });
                            return; // Share successful
                        } catch (err) {
                            console.warn('Share failed/cancelled, falling back to download', err);
                        }
                    }

                    // Fallback to auto-download
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                };

                // Start
                recorder.start();
                setIsRecording(true);

                // Start playback for recording (audio will be captured)
                if (!isPlaying && data) {
                    toggle(data);
                }

            } catch (err) {
                console.error("Recording failed:", err);
                setIsRecording(false);
                alert("Recording failed. Your browser might not support this feature.");
            }
        }
    };

    // URL to clipboard
    const handleShare = () => {
        const shareUrl = `${window.location.origin}/${encodeURIComponent(username)}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            setShowToast(true);
        }).catch(() => {
            // Fallback
            try {
                const textArea = document.createElement("textarea");
                textArea.value = shareUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setShowToast(true);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        });
    };

    // Screenshot export for testing layout
    const handleScreenshot = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `git-music-preview-${username || 'test'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    // Generate embed code
    const getEmbedCode = () => {
        const embedUrl = `${window.location.origin}/embed/${encodeURIComponent(username)}`;
        return `<iframe src="${embedUrl}" width="400" height="180" frameborder="0" scrolling="no" style="border-radius: 8px; border: none;"></iframe>`;
    };

    // Copy embed code to clipboard
    const handleCopyEmbed = () => {
        const embedCode = getEmbedCode();
        navigator.clipboard.writeText(embedCode).then(() => {
            setShowToast(true);
            setShowEmbed(false);
        }).catch(() => {
            // Fallback
            try {
                const textArea = document.createElement("textarea");
                textArea.value = embedCode;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setShowToast(true);
                setShowEmbed(false);
            } catch (err) {
                console.error('Failed to copy embed code', err);
            }
        });
    };



    // Load user from URL on mount
    useEffect(() => {
        // Support both /username and ?user=username formats
        const pathname = window.location.pathname;
        const pathUser = pathname.split('/').filter(Boolean).pop();
        const params = new URLSearchParams(window.location.search);
        const queryUser = params.get('user');
        const queryPlatform = params.get('platform');

        // Set platform if specified in URL
        if (queryPlatform === 'gitlab') {
            setPlatform('gitlab');
        }

        const userParam = pathUser || queryUser;
        if (userParam) {
            setUsername(userParam);
            loadData(userParam, queryPlatform);
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Skip if typing in input
            if (e.target.tagName === 'INPUT') return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    handleTogglePlay();
                    break;
                case 'KeyR':
                    if (data) handleExport();
                    break;
                case 'KeyS':
                    if (data) handleShare();
                    break;
                case 'KeyP':
                    if (data) handleScreenshot();
                    break;
                case 'Escape':
                    if (isPlaying) stop();
                    if (isRecording) handleExport();
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleTogglePlay, data, isPlaying, isRecording, stop, handleExport, handleShare, handleScreenshot]);

    // Update cursor position
    const updateCursorPos = useCallback(() => {
        if (inputRef.current) {
            setCursorPos(inputRef.current.selectionStart || 0);
        }
    }, []);

    // Calculate cursor offset using measurement span
    const getCursorOffset = () => {
        if (!measureRef.current || !inputRef.current) return 0;
        const textBeforeCursor = username.slice(0, cursorPos);
        measureRef.current.textContent = textBeforeCursor || '';
        return measureRef.current.offsetWidth;
    };

    return (
        <div className="terminal-window">
            {/* Toast Notification */}
            <div className={`toast-notification ${showToast ? 'show' : ''}`}>
                Copied to clipboard
            </div>

            {/* Embed Modal */}
            {showEmbed && (
                <div className="embed-modal-overlay" onClick={() => setShowEmbed(false)}>
                    <div className="embed-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="embed-modal-header">
                            <span>Embed Widget</span>
                            <button className="embed-modal-close" onClick={() => setShowEmbed(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <p className="embed-modal-desc">Add this widget to your website to showcase your contribution music.</p>
                        <div className="embed-code-box">
                            <code>{getEmbedCode()}</code>
                        </div>
                        <button className="embed-copy-btn" onClick={handleCopyEmbed}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            Copy Code
                        </button>
                    </div>
                </div>
            )}

            {/* Simple Header */}
            {/* Simple Fieldset Header */}
            <fieldset className="header-fieldset">
                <legend className="header-legend">
                    <span className="header-title">GitMusic</span> <span className="header-version">v1.0.0</span>
                </legend>

                <div className="header-content">
                    <div className="header-left">
                        <pre className="header-ascii">{`   ♫       ♪
 ▄ █ ▄ █ ▄ █
 █ █ █ █ █ █
 ▀ ▀ ▀ ▀ ▀ ▀`}</pre>
                    </div>

                    <div className="header-divider"></div>

                    <div className="header-right">
                        <div className="header-section">
                            <div className="header-label">Turn your GitHub/GitLab contributions into music</div>
                        </div>
                    </div>
                </div>
            </fieldset>

            {/* Command Input */}
            <div className="command-section">
                {/* Command Line */}
                <form onSubmit={handleSearch} className="command-line">
                    <span className="prompt">$</span>
                    <span className="cmd">gitmusic fetch</span>
                    <div className="input-wrapper">
                        <span ref={measureRef} className="input-measure" aria-hidden="true" />
                        {showCursor && (
                            <span
                                className="terminal-cursor"
                                style={{ left: `${getCursorOffset()}px` }}
                            />
                        )}
                        <input
                            ref={inputRef}
                            type="text"
                            value={username}
                            onChange={(e) => {
                                setUsername(e.target.value);
                                setShowCursor(true);
                                setTimeout(updateCursorPos, 0);
                            }}
                            onKeyUp={updateCursorPos}
                            onMouseUp={updateCursorPos}
                            onSelect={updateCursorPos}
                            onFocus={() => setShowCursor(true)}
                            onBlur={() => {
                                // Hide cursor when not focused
                                setShowCursor(false);
                                // Auto-load on click outside if valid
                                if (username.trim() && !isLoading) {
                                    handleSearch({ preventDefault: () => { } });
                                }
                            }}
                            placeholder="username"
                            disabled={isLoading}
                            autoComplete="off"
                            spellCheck="false"
                            autoFocus
                            inputMode="text"
                            autoCapitalize="none"
                        />
                    </div>
                </form>

                {/* Status Message - always reserve space */}
                <div className="status-msg">
                    {isAnimating ? (
                        <span className="dim">Loading...</span>
                    ) : error ? (
                        <span className="error">✗ {error}</span>
                    ) : data && hasNoContributions ? (
                        <span className="warning">⚠ no contributions found for this user</span>
                    ) : data ? (
                        <span className="success">✓ loaded {data.weeks.length} weeks</span>
                    ) : (
                        <>
                            <div className="hint-tip">└─ default: most active contributions</div>
                            <div className="hint-tip">└─ use -p github|gitlab to force platform</div>
                        </>
                    )
                    }
                </div>
            </div>

            {/* Contribution Graph */}
            <div className={`graph-section ${!data || isAnimating || error ? 'no-data' : ''}`} ref={graphSectionRef}>
                {data && !isAnimating && !error ? (
                    <div className="graph-grid">
                        {data.weeks.map((week, wIndex) => (
                            <WeekCol
                                key={wIndex}
                                ref={activeCol === wIndex ? activeWeekRef : null}
                                week={week}
                                weekIndex={wIndex}
                                isActive={activeCol === wIndex}
                                activeNotes={activeCol === wIndex ? activeNotes : []}
                                style={{ '--col-index': wIndex }}
                            />
                        ))}
                    </div>
                ) : (
                    <div className={`graph-grid empty ${isAnimating ? 'loading' : ''} ${error && !isAnimating ? 'error' : ''}`}>
                        {/* Empty 52x7 grid placeholder - always rendered to reserve space */}
                        {Array.from({ length: 52 }).map((_, wIndex) => (
                            <div
                                key={wIndex}
                                className="week-col"
                            >
                                {Array.from({ length: 7 }).map((_, dIndex) => (
                                    <div
                                        key={dIndex}
                                        className="day-cell"
                                        style={{ '--cell-index': wIndex + dIndex * 2 }}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="controls-row">
                <button
                    className={`ctrl-btn ${isPlaying && !isRecording ? 'active' : ''}`}
                    onClick={handleTogglePlay}
                    disabled={!data || isAnimating || error || isRecording || hasNoContributions}
                >
                    {isPlaying && !isRecording ? (
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
                <button
                    className={`ctrl-btn ${isRecording ? 'recording' : ''}`}
                    onClick={handleExport}
                    disabled={!data || isAnimating || error || hasNoContributions}
                >
                    {isRecording ? (
                        <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="8"></circle>
                                <rect x="9" y="9" width="6" height="6" rx="1"></rect>
                            </svg>
                            <span>Stop</span>
                        </>
                    ) : (
                        <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="8"></circle>
                            </svg>
                            <span>Record</span>
                        </>
                    )}
                </button>
                <button
                    className="ctrl-btn"
                    onClick={handleShare}
                    disabled={!data || isAnimating || error || hasNoContributions}
                    title="Copy link to clipboard"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy Link</span>
                </button>
                <button
                    className="ctrl-btn"
                    onClick={() => setShowEmbed(true)}
                    disabled={!data || isAnimating || error || hasNoContributions}
                    title="Get embed code for your website"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    <span>Embed</span>
                </button>
            </div>



            {/* Inline Embed Section - shows after music is generated */}
            {data && !isAnimating && !error && !hasNoContributions && (
                <div className="embed-section">
                    <div className="embed-section-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                        </svg>
                        <span>Embed on your website</span>
                    </div>
                    <div className="embed-section-code">
                        <code>{getEmbedCode()}</code>
                    </div>
                    <button className="embed-section-copy" onClick={handleCopyEmbed}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Copy Embed Code
                    </button>
                </div>
            )}

            {/* Footer hint */}
            <div className="footer-hint">
                {data && !isAnimating && !error
                    ? 'Space: play · R: record · S: share · Esc: stop'
                    : '\u00A0'
                }
            </div>

            {/* Hidden Canvas */}
            <canvas
                ref={canvasRef}
                style={{ position: 'fixed', top: '-10000px', left: '-10000px', pointerEvents: 'none' }}
            />
        </div>
    );
};

export default GitSequencer;
