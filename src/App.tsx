import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import { RetellWebClient } from "retell-client-js-sdk";

const agentId = "a3cfb6d7264592344634753c976bb05c";

interface RegisterCallResponse {
  callId?: string;
  sampleRate: number;
}

const webClient = new RetellWebClient();

const App = () => {
  const [isCalling, setIsCalling] = useState(false);
  const [webSocket, setWebSocket] = useState<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameQueue = useRef([]);
  const requestRef = useRef();

  const lastFrameTimeRef = useRef(performance.now());

  const processFrameQueue = () => {
    const now = performance.now();
    const timeSinceLastFrame = now - lastFrameTimeRef.current;
    const msPerFrame = 1000 / 30; // Approximately 33.33 milliseconds per frame

    if (timeSinceLastFrame >= msPerFrame) {
      if (frameQueue.current.length > 0) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { frameWidth, frameHeight, imageData } = frameQueue.current.shift();
        
        const blob = new Blob([imageData], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          canvas.width = frameWidth;
          canvas.height = frameHeight;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
        };
        img.onerror = (e) => {
          console.error("Error loading image from Blob", e);
        };
        img.src = url;
        lastFrameTimeRef.current = now;
      }
    }
    requestRef.current = requestAnimationFrame(processFrameQueue);
  };

  useEffect(() => {
    webClient.on("conversationStarted", () => {
      console.log("conversationStarted");
      const ws = new WebSocket('');
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log("WebSocket connection established.");
        const metadata = {
          video_reference_url: "",
          face_det_results: "",
          isSuperResolution: true,
          isJPG: true,
        };
        ws.send(JSON.stringify(metadata));
        setWebSocket(ws);
      };

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data);
        const frameIndex = new DataView(data.buffer.slice(0, 4)).getUint32(0, true);
        const frameWidth = new DataView(data.buffer.slice(4, 8)).getUint32(0, true);
        const frameHeight = new DataView(data.buffer.slice(8, 12)).getUint32(0, true);
        const imageData = data.subarray(12); // The rest is image data
        frameQueue.current.push({ frameWidth, frameHeight, imageData });
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed.");
        setWebSocket(null);
      };
    });

    webClient.on("audio", (audio: Uint8Array) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(audio);
      } else {
        console.log("WebSocket not ready or closed.");
      }
    });

    webClient.on("conversationEnded", ({ code, reason }) => {
      console.log("Closed with code:", code, ", reason:", reason);
      setIsCalling(false);
      webSocket?.close();
    });

    webClient.on("error", (error) => {
      console.error("An error occurred:", error);
      setIsCalling(false);
    });

    webClient.on("update", (update) => {
      console.log("update", update);
    });

    requestRef.current = requestAnimationFrame(processFrameQueue);

    return () => {
      if (webSocket) {
        webSocket.close();
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, [webSocket]);

  const toggleConversation = async () => {
    if (isCalling) {
      webClient.stopConversation();
      setIsCalling(false);
      webSocket?.close();
    } else {
      const registerCallResponse = await registerCall(agentId);
      if (registerCallResponse.callId) {
        webClient.startConversation({
          callId: registerCallResponse.callId,
          sampleRate: registerCallResponse.sampleRate,
          enableUpdate: true,
        }).catch(console.error);
        setIsCalling(true);
      }
    }
  };

  async function registerCall(agentId: string): Promise<RegisterCallResponse> {
    try {
      const response = await fetch("http://localhost:8080/register-call-on-your-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentId }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error(err);
      throw new Error(err.toString());
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <button onClick={toggleConversation}>
          {isCalling ? "Stop" : "Start"}
        </button>
        <canvas ref={canvasRef} width="512" height="512" style={{ border: '1px solid black' }}></canvas>
      </header>
    </div>
  );
};

export default App;
