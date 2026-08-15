// Section 24.3: this page never touches the database. Only the verified
// Stripe webhook (app/api/webhooks/stripe/route.ts) may mark an order paid.
export default function CheckoutReturnPage() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p>
        We are checking your payment. You can close this page. We will text you when the item check
        starts.
      </p>
    </main>
  );
}
