import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRDisplay({ joinCode, joinUrl }) {
  const url = joinUrl || `${window.location.origin}/join/${joinCode}`;
  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
      <QRCodeSVG value={url} size={160} level="M" includeMargin />
      <p className="text-xs text-gray-500 text-center break-all max-w-[180px]">{url}</p>
      <p className="text-2xl font-bold tracking-[0.3em] text-brand-600">{joinCode}</p>
    </div>
  );
}
