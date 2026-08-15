import { ProductGlyph } from "@/components/ProductGlyph";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { TextUsButton } from "@/components/TextUsButton";

const examples = [
  {
    title: "USB-C power adapter",
    kind: "adapter" as const,
    route: "Resell",
    price: "$18 - $24",
    condition: "Grade B",
  },
  {
    title: "Over-ear headphones",
    kind: "headphones" as const,
    route: "Repair",
    price: "$32 - $46",
    condition: "Grade C",
  },
  {
    title: "Four-port USB hub",
    kind: "hub" as const,
    route: "Donate",
    price: "$10 - $16",
    condition: "Grade A",
  },
  {
    title: "Bluetooth speaker",
    kind: "device" as const,
    route: "Resell",
    price: "$14 - $22",
    condition: "Grade B",
  },
];

const outcomes = [
  { name: "Resell", detail: "Price guidance and listing-ready facts", icon: "↗" },
  { name: "Donate", detail: "A useful handoff with less uncertainty", icon: "♡" },
  { name: "Repair", detail: "The missing detail or fix worth pursuing", icon: "+" },
  { name: "Recycle", detail: "A safer end-of-life route when reuse is not right", icon: "↻" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero-shell">
          <div className="hero-copy">
            <p className="eyebrow">A better current for used electronics</p>
            <h1>Know what it is. Know what it is worth. Know where it goes next.</h1>
            <p className="hero-lede">
              Send a few photos by text. SecondCurrent turns the visible evidence into a clear item
              record, price guidance, and a safer next step.
            </p>
            <div className="hero-actions">
              <TextUsButton className="button button-primary button-large">
                Text us a photo
              </TextUsButton>
              <a className="text-link" href="#how-it-works">
                See how it works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="trust-row" aria-label="Service benefits">
              <span>✓ No app to install</span>
              <span>✓ Human review when needed</span>
              <span>✓ Safety-first routing</span>
            </div>
          </div>

          <div className="passport-preview" aria-label="Example SecondCurrent item passport">
            <div className="preview-topline">
              <span className="status-dot" />
              Example item passport
              <span className="preview-id">SC-02418</span>
            </div>
            <div className="preview-visual">
              <ProductGlyph kind="adapter" />
              <span className="evidence-tag evidence-tag-one">Full item</span>
              <span className="evidence-tag evidence-tag-two">Label found</span>
            </div>
            <div className="preview-details">
              <div>
                <p className="preview-kicker">Identity confidence: high</p>
                <h2>Dell 65W USB-C power adapter</h2>
              </div>
              <span className="route-pill">Resell</span>
            </div>
            <div className="preview-stats">
              <div>
                <span>Condition</span>
                <strong>Grade B</strong>
              </div>
              <div>
                <span>Suggested range</span>
                <strong>$18 - $24</strong>
              </div>
              <div>
                <span>Safety</span>
                <strong>Clear</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="category-strip" aria-label="Electronics categories">
          <span>Phones</span>
          <span>Computers</span>
          <span>Cables</span>
          <span>Audio</span>
          <span>Chargers</span>
          <span>Accessories</span>
        </section>

        <section className="section-shell examples-section" id="what-you-get">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">Evidence, organized</p>
              <h2>A product page you can actually trust</h2>
            </div>
            <p>
              Marketplace listings are built to sell. A SecondCurrent passport is built to show what
              the photos support, what remains unknown, and what to do next.
            </p>
          </div>
          <div className="product-grid">
            {examples.map((example) => (
              <article className="product-card" key={example.title}>
                <div className="product-art">
                  <span className="example-label">Example report</span>
                  <ProductGlyph kind={example.kind} />
                </div>
                <div className="product-card-body">
                  <p className="product-meta">
                    Verified <span>•</span> {example.condition}
                  </p>
                  <h3>{example.title}</h3>
                  <div className="product-card-bottom">
                    <strong>{example.price}</strong>
                    <span className="small-route-pill">{example.route}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="process-section" id="how-it-works">
          <div className="section-shell process-grid">
            <div className="process-intro">
              <p className="eyebrow eyebrow-light">Three simple steps</p>
              <h2>From mystery drawer to useful next step.</h2>
              <p>
                Start with the evidence you already have. We will ask for another photo only when it
                can change the result.
              </p>
              <TextUsButton className="button button-light">Start by text</TextUsButton>
            </div>
            <ol className="step-list">
              <li>
                <span>01</span>
                <div>
                  <h3>Send a few clear photos</h3>
                  <p>Show the full item, its connector, and any label or model number.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>We check the visible evidence</h3>
                  <p>Identity, condition, data risk, safety, and likely market value.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Get a reusable item passport</h3>
                  <p>Keep a clear record and take the recommended route with more confidence.</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="section-shell outcome-section" id="why-secondcurrent">
          <div className="section-heading centered-heading">
            <p className="eyebrow">Not everything belongs in a listing</p>
            <h2>One item. The right next current.</h2>
            <p>
              The best outcome may be a sale, a donation, a repair, or responsible recycling. The
              evidence decides.
            </p>
          </div>
          <div className="outcome-grid">
            {outcomes.map((outcome) => (
              <article className="outcome-card" key={outcome.name}>
                <span className="outcome-icon" aria-hidden="true">
                  {outcome.icon}
                </span>
                <h3>{outcome.name}</h3>
                <p>{outcome.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="proof-section">
          <div className="section-shell proof-grid">
            <div>
              <p className="eyebrow">Why the record matters</p>
              <h2>Less guesswork for everyone downstream.</h2>
            </div>
            <div className="proof-points">
              <div>
                <strong>Visible limits</strong>
                <p>Unknown facts stay unknown. Confidence is labeled instead of hidden.</p>
              </div>
              <div>
                <strong>Human checkpoints</strong>
                <p>Ambiguous or sensitive items can be reviewed before a public passport ships.</p>
              </div>
              <div>
                <strong>Safer handoffs</strong>
                <p>Data risk and visible hazards are surfaced before resale or donation.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Start with one forgotten device</p>
            <h2>Give it a better next use.</h2>
          </div>
          <TextUsButton className="button button-primary button-large">
            Text photos to SecondCurrent
          </TextUsButton>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
