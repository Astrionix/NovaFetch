import { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
  isPlaying: boolean;
  color?: string;
}

export function WaveformVisualizer({ isPlaying, color = '#f5c842' }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const numBars = 32;
    const heights = Array.from({ length: numBars }, () => Math.random() * 0.4 + 0.1);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width - (numBars - 1) * 3) / numBars;

      for (let i = 0; i < numBars; i++) {
        if (isPlaying) {
          heights[i] += (Math.random() - 0.5) * 0.15;
          heights[i] = Math.max(0.1, Math.min(1.0, heights[i]));
        } else {
          heights[i] += (0.15 - heights[i]) * 0.1;
        }

        const barHeight = heights[i] * (canvas.height - 8);
        const x = i * (barWidth + 3);
        const y = (canvas.height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(234, 179, 8, 0.2)');

        ctx.fillStyle = isPlaying ? gradient : 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, color]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={48}
      style={{ display: 'block', margin: '8px auto', borderRadius: '8px' }}
    />
  );
}

export default WaveformVisualizer;
