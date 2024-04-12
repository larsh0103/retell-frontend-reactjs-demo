// VideoPlayer.tsx
import React, { useState, useEffect, useRef } from 'react';

const VideoPlayer = ({ wsUrl }: { wsUrl: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const [webSocket, setWebSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    mediaSourceRef.current = new MediaSource();
    const video = videoRef.current;
    video.src = URL.createObjectURL(mediaSourceRef.current);

    mediaSourceRef.current.addEventListener('sourceopen', () => {
      sourceBufferRef.current = mediaSourceRef.current.addSourceBuffer('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
      setupWebSocket();
    });

    return () => {
      webSocket?.close();
      if (mediaSourceRef.current) {
        mediaSourceRef.current.endOfStream();
      }
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  const setupWebSocket = () => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (event) => {
      const { data } = event;
      if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
        sourceBufferRef.current.appendBuffer(new Uint8Array(data));
      }
    };
    setWebSocket(ws);
  };

  return (
    <video ref={videoRef} controls autoPlay width="640" height="480">
      Your browser does not support the video tag.
    </video>
  );
};

export default VideoPlayer;
