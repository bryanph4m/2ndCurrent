import Link from "next/link";
import { listActiveListingsForBrowse } from "@secondcurrent/db";
import { ProductGlyph } from "@/components/ProductGlyph";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const dynamic = "force-dynamic";

function glyphKind(category: string): "adapter" | "headphones" | "hub" | "device" {
  const lower = category.toLowerCase();
  if (lower.includes("adapter") || lower.includes("charger") || lower.includes("power")) {
    return "adapter";
  }
  if (lower.includes("headphone") || lower.includes("earbud") || lower.includes("audio")) {
    return "headphones";
  }
  if (lower.includes("hub") || lower.includes("cable")) {
    return "hub";
  }
  return "device";
}

export default async function BrowsePage() {
  const listings = await listActiveListingsForBrowse();

  return (
    <>
      <SiteHeader />
      <main className="market-home page-shell">
        <section className="market-section" style={{ paddingTop: 48 }}>
          <div className="market-section-heading">
            <div>
              <h1>Browse listings</h1>
              <p>Every item here has a published evidence record behind it.</p>
            </div>
          </div>
          {listings.length === 0 ? (
            <p className="empty-state">No items are listed yet. Check back soon.</p>
          ) : (
            <div className="market-product-row">
              {listings.map((listing) => (
                <Link
                  href={`/item/${listing.slug}`}
                  className="market-product-card"
                  key={listing.slug}
                >
                  <div className="market-product-art market-tone-blue">
                    <ProductGlyph kind={glyphKind(listing.category)} />
                    {!listing.purchasable && <span className="market-card-badge">Coming soon</span>}
                  </div>
                  <div className="market-product-copy">
                    <h3>{listing.title}</h3>
                    <strong>${(listing.priceCents / 100).toFixed(2)}</strong>
                    <p>Condition {listing.conditionGrade}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
