import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

// Same rule as checkout/return: this page never touches the database. Only
// the verified Stripe webhook (app/api/webhooks/stripe/route.ts) may mark a
// sale paid.
export default function BuyReturnPage() {
  return (
    <>
      <SiteHeader compact />
      <main className="status-page page-shell">
        <section className="status-card">
          <div className="status-icon" aria-hidden="true">
            <span />
          </div>
          <p className="eyebrow">Payment received</p>
          <h1>We are confirming your purchase.</h1>
          <p className="status-lede">
            Stripe has returned you safely to SecondCurrent. We are verifying the payment before the
            sale is finalized.
          </p>
          <ol className="status-steps">
            <li className="status-step-complete">
              <span>✓</span>
              <div>
                <strong>Checkout complete</strong>
                <small>Your payment details stay with Stripe.</small>
              </div>
            </li>
            <li className="status-step-active">
              <span>2</span>
              <div>
                <strong>Payment verification</strong>
                <small>This usually takes only a moment.</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Purchase confirmed</strong>
                <small>We will text you once the seller is notified.</small>
              </div>
            </li>
          </ol>
          <div className="status-note">
            You can close this page. There is no need to refresh or submit payment again.
          </div>
          <a className="text-link" href="/">
            Return to SecondCurrent
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
