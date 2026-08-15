"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";

// Same number and pre-filled body as a direct sms: link (see docs/architecture.md
// section 12.1: the QR code is a shortcut into the same Linq text flow, not a
// separate upload channel). The QR just gets that link onto a phone that can
// actually send a text, since desktop `sms:` links have no texting app behind them.
const PHONE_DISPLAY = "(415) 583-7575";
const SMS_HREF = "sms:+14155837575?body=SELL";

type TextUsButtonProps = {
  className: string;
  children: ReactNode;
};

export function TextUsButton({ className, children }: TextUsButtonProps) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || qrDataUrl) return;
    QRCode.toDataURL(SMS_HREF, { margin: 1, width: 220 }).then(setQrDataUrl);
  }, [open, qrDataUrl]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <div
          className="text-us-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Text a photo to SecondCurrent"
          onClick={() => setOpen(false)}
        >
          <div className="text-us-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="text-us-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              &times;
            </button>
            <p className="eyebrow">Start on your phone</p>
            <h2>Scan to text us a photo</h2>
            <p className="text-us-lede">
              Scan this with your phone&apos;s camera. It opens a text to SecondCurrent with SELL
              already filled in.
            </p>
            <div className="text-us-qr">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code that opens a text message to SecondCurrent" />
              ) : (
                <div className="text-us-qr-loading" aria-hidden="true" />
              )}
            </div>
            <p className="text-us-number">{PHONE_DISPLAY}</p>
            <a className="text-link" href={SMS_HREF}>
              Already on your phone? Open Messages directly
            </a>
          </div>
        </div>
      )}
    </>
  );
}
