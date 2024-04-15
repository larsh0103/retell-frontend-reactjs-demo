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
  const audioQueue = useRef<Float32Array[]>([]);
  const audioContext = useRef(new AudioContext());
  const requestRef = useRef();
  const lastFrameTimeRef = useRef(performance.now());
  const audioStarted = useRef(false);
  const firstFrameReceived = useRef(false);

  const processFrameQueue = () => {
    const now = performance.now();
    const timeSinceLastFrame = now - lastFrameTimeRef.current;
    const msPerFrame = 1000 / 30;  // Approximately 33.33 milliseconds per frame

    if (timeSinceLastFrame >= msPerFrame) {
        if (frameQueue.current.length > 0) {
            firstFrameReceived.current = true;
            const { frameWidth, frameHeight, imageData } = frameQueue.current.shift();
            const blob = new Blob([imageData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');
                canvas.width = frameWidth;
                canvas.height = frameHeight;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                
                // Check if audio has started or not
                // console.log("audioQueue.current.length", audioQueue.current.length);
                // console.log("frameQueue.current.length", frameQueue.current.length);
                // console.log("audioStarted.current", audioStarted.current);
                if (!audioStarted.current && audioQueue.current.length > 0) {
                    playAudioFromBuffer();
                    audioStarted.current = true;  // Set the flag to true after starting the audio
                }
            };
            img.src = url;
            lastFrameTimeRef.current = now;
        }
    }
    requestRef.current = requestAnimationFrame(processFrameQueue);
};

const playBeep = () => {
  if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();  // Ensure the audio context is running
  }

  const oscillator = audioContext.current.createOscillator();
  oscillator.type = 'sine';  // Sine wave — other types are 'square', 'sawtooth', 'triangle'
  oscillator.frequency.setValueAtTime(440, audioContext.current.currentTime);  // Frequency in hertz (A4 pitch)
  oscillator.connect(audioContext.current.destination);

  oscillator.start();
  oscillator.stop(audioContext.current.currentTime + 0.2);  // Stop after 200 ms
};

const convertUint8ToFloat32 = (array: Uint8Array): Float32Array => {
  const targetArray = new Float32Array(array.byteLength / 2);
  const sourceDataView = new DataView(array.buffer);

  for (let i = 0; i < targetArray.length; i++) {
    targetArray[i] = sourceDataView.getInt16(i * 2, true) / 32768;  // 2^15 = 32768
  }
  return targetArray;
};

const convertFloat32ToUint8 = (array: Float32Array): Uint8Array => {
  const buffer = new ArrayBuffer(array.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < array.length; i++) {
    const value = Math.round(array[i] * 32768);  // Multiply by 2^15 to scale back to 16-bit range
    view.setInt16(i * 2, value, true); // true for little-endian
  }

  return new Uint8Array(buffer);
};



const playAudioFromBuffer = async () => {
  // Wait until the first frame has been received
  while (!firstFrameReceived.current) {
    await new Promise(resolve => setTimeout(resolve, 1)); // Wait for 100 ms before checking again
  }

  // Begin or continue audio playback
  // console.log("Starting to play audio from buffer...");
  while (audioQueue.current.length > 0) {
    const segment = audioQueue.current.shift(); // Take the first available segment
    const audioBuffer = audioContext.current.createBuffer(1, segment.length, 16000);
    audioBuffer.getChannelData(0).set(segment);

    const source = audioContext.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.current.destination);
    source.start();

    // Optional: Handle the end of playback to trigger additional actions
    // source.onended = () => {
    //   // console.log("Audio segment finished playing.");
    // };

    // Wait until this segment finishes before starting the next
    await new Promise(resolve => source.onended = resolve);
  }
};




  useEffect(() => {
    webClient.on("conversationStarted", () => {
      console.log("conversationStarted");
      const ws = new WebSocket('ws://35.203.156.156:8892/LipsyncStream');
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log("WebSocket connection established.");
        const metadata = {
          video_reference_url: "https://storage.googleapis.com/charactervideos/11c30c18-86c3-424e-bb29-9c6d1fd6003b/11c30c18-86c3-424e-bb29-9c6d1fd6003b.mp4",
          face_det_results: "https://storage.googleapis.com/charactervideos/11c30c18-86c3-424e-bb29-9c6d1fd6003b/11c30c18-86c3-424e-bb29-9c6d1fd6003b.pkl",
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
      // console.log("Received audio data type:", audio.constructor.name); // Logs the type of the audio data

      // //if values of audio are not silence then log that
      // // if (audio.some((value) => value !== 128)) {
      // //   console.log("audio", audio);
      // // }
      // const audioData = convertUint8ToFloat32(audio);
      // audioQueue.current.push(audioData);
      //   // if (!audioStarted.current && audioQueue.current.length > 0) {
      //   //     playAudioFromBuffer();
      //   //     audioStarted.current = true;
      //   // }
    
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(audio);
        const audioData = convertUint8ToFloat32(audio);
        audioQueue.current.push(audioData);
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
      // console.log("update", update);
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

  const handlePlayButtonClick = () => {
    if (audioContext.current.state !== 'running') {
      audioContext.current.resume().then(() => {
        console.log("AudioContext resumed successfully");
        playAudioFromBuffer(); // Call the function to play audio after resuming context
      }).catch((error) => {
        console.error("Error resuming AudioContext:", error);
      });
    } else {
      playAudioFromBuffer();
      audioStarted.current = true; 
      // If already running, play audio directly
    }
  };

  return (
    <div className="App">
        <header className="App-header">
            <button onClick={toggleConversation}>
                {isCalling ? "Stop" : "Start"}
            </button>
            <button onClick={handlePlayButtonClick}>Play Audio</button>
            <canvas ref={canvasRef} width="512" height="512" style={{ border: '1px solid black' }}></canvas>
        </header>
    </div>
);

};

export default App;
