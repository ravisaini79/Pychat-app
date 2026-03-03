import { useRef, useEffect, useState } from 'react';
import './CallOverlay.css';

export default function CallOverlay({
    onEnd,
    localStream,
    remoteStream,
    isIncoming,
    onAccept,
    callerName,
    isGroupCall
}) {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const [audioMuted, setAudioMuted] = useState(false);
    const [videoOff, setVideoOff] = useState(false);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const toggleAudio = () => {
        const track = localStream?.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setAudioMuted(!track.enabled);
        }
    };

    const toggleVideo = () => {
        const track = localStream?.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setVideoOff(!track.enabled);
        }
    };

    return (
        <div className="call-overlay">
            <div className="call-container">
                {isIncoming ? (
                    <div className="incoming-call-alert">
                        <div className="caller-info">
                            <div className="caller-avatar">👤</div>
                            <h2>{callerName || 'Incoming Call'}</h2>
                            <p>PyChat Video Call</p>
                        </div>
                        <div className="incoming-actions">
                            <button className="btn-call btn-accept" onClick={onAccept}>📞 Accept</button>
                            <button className="btn-call btn-reject" onClick={onEnd}>🔚 Reject</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="remote-video-wrap">
                            {remoteStream ? (
                                <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
                            ) : (
                                <div className="calling-state">
                                    <div className="pulse-avatar">👤</div>
                                    <p>Calling {callerName}...</p>
                                </div>
                            )}
                        </div>

                        <div className="local-video-wrap">
                            <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
                            {videoOff && <div className="video-off-placeholder">Camera Off</div>}
                        </div>

                        <div className="call-controls">
                            <button
                                className={`btn-control ${audioMuted ? 'muted' : ''}`}
                                onClick={toggleAudio}
                                title={audioMuted ? 'Unmute' : 'Mute'}
                            >
                                {audioMuted ? '🔇' : '🎤'}
                            </button>
                            <button
                                className={`btn-control ${videoOff ? 'video-off' : ''}`}
                                onClick={toggleVideo}
                                title={videoOff ? 'Start Camera' : 'Stop Camera'}
                            >
                                {videoOff ? '🚫' : '📹'}
                            </button>
                            <button className="btn-control btn-end" onClick={onEnd} title="End Call">
                                📞
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
