import React, { useContext, useEffect, useRef } from 'react';

import { SettingsContext } from './Settings';

export const MicTest = () => {
  const settings = useContext(SettingsContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function analyzeAudio () {
      const audioContext = new AudioContext();
      // TODO: check permissions
      // TODO: close old stream and get new one if user changes mic setting
      const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: settings.microphone,
          },
        });
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = new AnalyserNode(audioContext, { fftSize: 64, smoothingTimeConstant: 0.7 });
      source.connect(analyzer);
      const data = new Uint8Array(analyzer.frequencyBinCount);
      const canvasWidth = analyzer.frequencyBinCount * 2;
      const canvasHeight = 32;

      function drawAudio () {
        const canvas = canvasRef?.current;
        if (!canvas) {
          requestAnimationFrame(drawAudio);
          return;
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext("2d") as CanvasRenderingContext2D;

        analyzer.getByteFrequencyData(data);
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        context.fillStyle = "rgb(255, 255, 255)";
        context.fillRect(0, 0, canvasWidth, canvasHeight);

        const barWidth = canvasWidth / data.length;
        let x = 0;

        for (let i = 0; i < data.length; i++) {
          const barHeight = data[i] / 255 * canvasHeight;

          context.fillStyle = `rgb(50, 200, 50)`;
          context.fillRect(x, canvasHeight - barHeight, barWidth, barHeight);

          x += barWidth;
        }

        requestAnimationFrame(drawAudio);
      }
      requestAnimationFrame(drawAudio);
    }
    analyzeAudio();
  });
  return <div style={{ float: "right", border: "1px black solid" }}>
    🎤
    <canvas ref={canvasRef} />
  </div>;
};
