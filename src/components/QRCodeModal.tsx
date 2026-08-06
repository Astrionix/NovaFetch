import { useEffect, useRef } from 'react';

interface QRCodeModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export function QRCodeModal({ url, title, onClose }: QRCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fast SVG/Canvas QR fallback matrix renderer using Google Chart / QR Server API or canvas matrix
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&color=000000&bgcolor=ffffff`;
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 10, 10, 200, 200);
    };
  }, [url]);

  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div className="glass glass-3d modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 className="modal-title">📱 Mobile QR Share</h3>
        <p className="modal-sub">Scan with phone camera to instantly stream or download</p>

        <div className="qr-wrap">
          <canvas ref={canvasRef} width={220} height={220} className="qr-canvas" />
        </div>

        <div className="qr-url">{title}</div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(url)}>
            📋 Copy Link
          </button>
          <button className="btn-analyze" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default QRCodeModal;
