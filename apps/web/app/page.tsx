import { ProductGlyph } from "@/components/ProductGlyph";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { TextUsButton } from "@/components/TextUsButton";

const featuredItems = [
  {
    title: "Dell 65W USB-C power adapter",
    kind: "adapter" as const,
    route: "Resell",
    price: "$18 - $24",
    condition: "Grade B",
    tone: "blue",
  },
  {
    title: "Over-ear wireless headphones",
    kind: "headphones" as const,
    route: "Repair",
    price: "$32 - $46",
    condition: "Grade C",
    tone: "coral",
  },
  {
    title: "Four-port USB hub",
    kind: "hub" as const,
    route: "Donate",
    price: "$10 - $16",
    condition: "Grade A",
    tone: "cream",
  },
  {
    title: "Compact Bluetooth speaker",
    kind: "device" as const,
    route: "Resell",
    price: "$14 - $22",
    condition: "Grade B",
    tone: "yellow",
  },
  {
    title: "Travel charging block",
    kind: "adapter" as const,
    route: "Donate",
    price: "$8 - $12",
    condition: "Grade B",
    tone: "mint",
  },
  {
    title: "Wired desktop headphones",
    kind: "headphones" as const,
    route: "Recycle",
    price: "$6 - $10",
    condition: "Grade C",
    tone: "lavender",
  },
];

const categories = [
  { name: "Phones", kind: "device" as const, tone: "coral" },
  { name: "Computers", kind: "device" as const, tone: "blue" },
  { name: "Chargers", kind: "adapter" as const, tone: "yellow" },
  { name: "Audio", kind: "headphones" as const, tone: "lavender" },
  { name: "Cables", kind: "hub" as const, tone: "mint" },
  { name: "Accessories", kind: "hub" as const, tone: "cream" },
  { name: "Other tech", kind: "device" as const, tone: "slate" },
];

const outcomes = [
  { name: "Resell", detail: "Price guidance and listing-ready facts", mark: "01" },
  { name: "Donate", detail: "A useful handoff with less uncertainty", mark: "02" },
  { name: "Repair", detail: "The missing detail or fix worth pursuing", mark: "03" },
  { name: "Recycle", detail: "A safer end-of-life route when reuse is not right", mark: "04" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="market-home">
        <section className="market-hero" aria-labelledby="market-hero-title">
          <div className="market-hero-copy">
            <p className="market-overline">A better current for used electronics</p>
            <h1 id="market-hero-title">Turn mystery tech into a useful next step.</h1>
            <p>
              Text us a few photos. Get a clear item record, price guidance, and a safer route for
              resale, repair, donation, or recycling.
            </p>
            <TextUsButton className="market-cta market-cta-dark">Text us a photo</TextUsButton>
          </div>

          <div className="market-hero-visual" aria-label="Example electronics item passport">
            <div className="hero-orbit hero-orbit-one" />
            <div className="hero-orbit hero-orbit-two" />
            <div className="hero-product-disc">
              <ProductGlyph kind="adapter" />
            </div>
            <div className="hero-passport-card">
              <div>
                <span className="status-dot" />
                <small>Identity confidence: high</small>
              </div>
              <strong>Dell 65W USB-C adapter</strong>
              <p>Grade B · Suggested $18 - $24</p>
              <span className="hero-route-pill">Resell</span>
            </div>
          </div>

          <div className="market-carousel-controls" aria-label="Featured story controls">
            <button type="button" aria-label="Previous story">
              &#8592;
            </button>
            <div aria-label="Slide 1 of 3">
              <span className="is-active" />
              <span />
              <span />
            </div>
            <button type="button" aria-label="Next story">
              &#8594;
            </button>
          </div>
        </section>

        <section className="market-section" id="what-you-get">
          <div className="market-section-heading">
            <div>
              <h2>Popular item passports</h2>
              <p>See how everyday electronics become clear, reusable records.</p>
            </div>
            <a href="#how-it-works">
              See how it works <span aria-hidden="true">&#8594;</span>
            </a>
          </div>

          <div className="market-product-row">
            {featuredItems.map((item) => (
              <article className="market-product-card" key={item.title}>
                <div className={`market-product-art market-tone-${item.tone}`}>
                  <span className="market-card-badge">Verified example</span>
                  <ProductGlyph kind={item.kind} />
                  <button
                    type="button"
                    aria-label={`Save ${item.title}`}
                    className="market-save-button"
                  >
                    &#9825;
                  </button>
                </div>
                <div className="market-product-copy">
                  <h3>{item.title}</h3>
                  <strong>{item.price}</strong>
                  <p>
                    {item.condition} · {item.route}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="market-promo market-promo-navy" id="how-it-works">
          <div className="market-promo-copy">
            <p className="market-overline">Simple from the first text</p>
            <h2>Three photos. One evidence-backed answer.</h2>
            <p>
              Show the full item, its connector, and any label. We only ask another question when it
              can meaningfully change the result.
            </p>
            <TextUsButton className="market-cta market-cta-light">Start by text</TextUsButton>
          </div>
          <ol className="market-step-stack">
            <li>
              <span>1</span>
              <div>
                <strong>Send clear photos</strong>
                <p>No app or account to create.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>We check the evidence</strong>
                <p>Identity, condition, safety, data risk, and value.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Get your item passport</strong>
                <p>A useful record with the right next route.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="market-section market-category-section">
          <div className="market-section-heading">
            <div>
              <h2>Explore common electronics</h2>
              <p>Start with whatever is waiting in the drawer.</p>
            </div>
            <TextUsButton className="market-inline-action">Check an item &#8594;</TextUsButton>
          </div>
          <div className="market-category-row">
            {categories.map((category) => (
              <div className="market-category-card" key={category.name}>
                <div className={`market-category-art market-tone-${category.tone}`}>
                  <ProductGlyph kind={category.kind} />
                </div>
                <strong>{category.name}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="market-promo market-promo-coral" id="why-secondcurrent">
          <div className="market-promo-copy">
            <p className="market-overline">Evidence over guesswork</p>
            <h2>A product page you can actually trust.</h2>
            <p>
              Confirmed facts stay separate from open questions, with human review when the photos
              cannot tell the whole story.
            </p>
            <a className="market-cta market-cta-outline" href="#routes">
              See the possible routes
            </a>
          </div>
          <div className="market-proof-card">
            <p>SecondCurrent item passport</p>
            <div>
              <span>Visible limits</span>
              <strong>Unknown stays unknown</strong>
            </div>
            <div>
              <span>Human checkpoints</span>
              <strong>Review when it matters</strong>
            </div>
            <div>
              <span>Safer handoffs</span>
              <strong>Risks surfaced early</strong>
            </div>
          </div>
        </section>

        <section className="market-section" id="routes">
          <div className="market-section-heading">
            <div>
              <h2>One item. The right next current.</h2>
              <p>The best outcome is not always a listing. The evidence decides.</p>
            </div>
            <a href="#start">
              Start with one item <span aria-hidden="true">&#8594;</span>
            </a>
          </div>
          <div className="market-outcome-row">
            {outcomes.map((outcome) => (
              <article className="market-outcome-card" key={outcome.name}>
                <span>{outcome.mark}</span>
                <h3>{outcome.name}</h3>
                <p>{outcome.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="market-final-banner" id="start">
          <div>
            <p className="market-overline">Start with one forgotten device</p>
            <h2>Give it a better next use.</h2>
          </div>
          <TextUsButton className="market-cta market-cta-dark">
            Text photos to SecondCurrent
          </TextUsButton>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
