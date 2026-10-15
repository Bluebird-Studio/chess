import { useEffect, useRef } from 'react';

export function ResignDialog({ color, onCancel, onConfirm }: { color: 'w' | 'b'; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="promotion-dialog resign-dialog" aria-labelledby="resign-title" aria-describedby="resign-description" onCancel={event => { event.preventDefault(); onCancel(); }} onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="resign-dialog-content">
      <span className="eyebrow">END THIS GAME</span>
      <h2 id="resign-title">Resign as {color === 'w' ? 'White' : 'Black'}?</h2>
      <p id="resign-description">{color === 'w' ? 'Black' : 'White'} will win. Your clock keeps running while you decide.</p>
      <div className="resign-dialog-actions"><button autoFocus onClick={onCancel}>Keep playing</button><button className="confirm-resign" onClick={onConfirm}>Resign game</button></div>
    </div>
  </dialog>;
}
