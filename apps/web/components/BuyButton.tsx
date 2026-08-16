"use client";

import { useState, type FormEvent } from "react";

type BuyButtonProps = {
  slug: string;
  className: string;
};

export function BuyButton({ slug, className }: BuyButtonProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      const response = await fetch(`/api/checkout/buy/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const { checkoutUrl } = (await response.json()) as { checkoutUrl: string };
      window.location.href = checkoutUrl;
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Buy this item
      </button>
      {open && (
        <div
          className="text-us-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Buy this item"
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
            <p className="eyebrow">One step to pay</p>
            <h2>Where should we reach you?</h2>
            <p className="text-us-lede">
              We text a purchase confirmation to this number. You will pay on the next screen.
            </p>
            <form onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="buy-phone">
                Phone number
              </label>
              <input
                id="buy-phone"
                type="tel"
                required
                placeholder="Phone number"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <button
                type="submit"
                className="button button-primary button-large"
                disabled={status === "submitting"}
                style={{ marginTop: 16, width: "100%" }}
              >
                {status === "submitting" ? "Starting checkout..." : "Continue to payment"}
              </button>
              {status === "error" && (
                <p className="form-error" style={{ marginTop: 12 }}>
                  We could not start checkout. Check the number and try again.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
