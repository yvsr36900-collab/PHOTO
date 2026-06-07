import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function InvitePoster({ session }) {
  const posterRef = useRef(null);
  const joinUrl = `${window.location.origin}/join/${session.joinCode}`;

  async function downloadPng() {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(posterRef.current, { scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = `${session.name.replace(/\s+/g, '_')}_invite.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <div className="space-y-4">
      <div
        ref={posterRef}
        className="w-72 bg-gradient-to-br from-brand-600 to-purple-600 text-white rounded-2xl p-6 mx-auto shadow-xl"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        <p className="text-xs uppercase tracking-widest text-white/70 mb-1">You're invited to</p>
        <h2 className="text-2xl font-bold leading-tight mb-1">{session.name}</h2>
        <p className="text-white/80 text-sm mb-4">{session.occasionType}</p>
        <div className="bg-white rounded-xl p-3 flex flex-col items-center gap-2">
          <QRCodeSVG value={joinUrl} size={120} level="M" />
          <p className="text-gray-500 text-xs">Scan or use code</p>
          <p className="text-2xl font-bold tracking-[0.4em] text-brand-600">{session.joinCode}</p>
        </div>
        <p className="text-white/60 text-xs text-center mt-3">Share photos at snapgather.app</p>
      </div>
      <div className="text-center">
        <button onClick={downloadPng} className="btn-secondary text-sm">
          ⬇ Download as PNG
        </button>
      </div>
    </div>
  );
}
