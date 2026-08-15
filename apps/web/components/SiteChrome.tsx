import { TextUsButton } from "./TextUsButton";

type SiteHeaderProps = {
  compact?: boolean;
};

const primaryCategories = [
  "Phones",
  "Computers",
  "Chargers",
  "Audio",
  "Cables",
  "Accessories",
  "Repair",
  "Reuse",
];

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="SecondCurrent home">
      <span className="brand-mark" aria-hidden="true">
        2
      </span>
      <span>SecondCurrent</span>
    </a>
  );
}

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <>
      {!compact && (
        <div className="utility-bar">
          <div className="utility-bar-inner">
            <div className="utility-links utility-links-left">
              <span>
                Hi! <a href="/#start">Start with a photo</a>
              </span>
              <a href="/#what-you-get">Item passports</a>
              <a href="/#why-secondcurrent">Help &amp; safety</a>
            </div>
            <div className="utility-links utility-links-right">
              <a href="/#start">Sell</a>
              <a href="/#how-it-works">How it works</a>
              <a href="/#why-secondcurrent">About</a>
              <a href="/admin">Admin</a>
              <a className="utility-icon" href="/#what-you-get" aria-label="Saved examples">
                &#9825;
              </a>
              <a className="utility-icon" href="/#start" aria-label="Start a check">
                &#43;
              </a>
            </div>
          </div>
        </div>
      )}

      <header className={`site-header${compact ? " site-header--compact" : ""}`}>
        <div className="site-header-inner">
          <Brand />
          <a className="shop-category-link" href="/#categories">
            Shop by
            <br />
            category <span aria-hidden="true">&#8964;</span>
          </a>
          <form
            id="market-search-form"
            className="market-search"
            role="search"
            action="/#what-you-get"
          >
            <span className="market-search-icon" aria-hidden="true">
              &#9906;
            </span>
            <label className="sr-only" htmlFor="market-search-input">
              Search SecondCurrent
            </label>
            <input
              id="market-search-input"
              name="q"
              type="search"
              placeholder="Search item passports and electronics"
            />
            <label className="sr-only" htmlFor="market-search-category">
              Search category
            </label>
            <select id="market-search-category" name="category" defaultValue="all">
              <option value="all">All Categories</option>
              <option value="phones">Phones</option>
              <option value="computers">Computers</option>
              <option value="audio">Audio</option>
              <option value="chargers">Chargers</option>
            </select>
          </form>
          <button className="market-search-submit" type="submit" form="market-search-form">
            Search
          </button>
          <a className="market-search-secondary" href="/#why-secondcurrent">
            Advanced
          </a>
        </div>
        {!compact && (
          <nav className="market-category-nav" id="categories" aria-label="Electronics categories">
            {primaryCategories.map((category) => (
              <a href="/#what-you-get" key={category}>
                {category}
              </a>
            ))}
            <a href="/#routes">
              More <span aria-hidden="true">&#8964;</span>
            </a>
          </nav>
        )}
      </header>
    </>
  );
}

const footerColumns = [
  {
    title: "Get started",
    links: [
      ["Text a photo", "/#start"],
      ["How it works", "/#how-it-works"],
      ["Item passports", "/#what-you-get"],
      ["Possible routes", "/#routes"],
    ],
  },
  {
    title: "Reuse electronics",
    links: [
      ["Resell", "/#routes"],
      ["Donate", "/#routes"],
      ["Repair", "/#routes"],
      ["Recycle", "/#routes"],
    ],
  },
  {
    title: "SecondCurrent",
    links: [
      ["Why it matters", "/#why-secondcurrent"],
      ["Evidence standards", "/#why-secondcurrent"],
      ["Human review", "/#how-it-works"],
      ["Operations", "/admin"],
    ],
  },
  {
    title: "Help & safety",
    links: [
      ["Photo guide", "/#how-it-works"],
      ["Data safety", "/#why-secondcurrent"],
      ["Battery safety", "/#why-secondcurrent"],
      ["Contact", "/#start"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        {footerColumns.map((column) => (
          <div className="footer-column" key={column.title}>
            <strong>{column.title}</strong>
            {column.links.map(([label, href]) => (
              <a href={href} key={label}>
                {label}
              </a>
            ))}
          </div>
        ))}
        <div className="footer-brand-column">
          <Brand />
          <p>Clearer evidence for safer electronics reuse.</p>
          <TextUsButton className="footer-text-button">Text us a photo</TextUsButton>
        </div>
      </div>
      <div className="site-footer-legal">
        <span>SecondCurrent · Built for reuse, repair, resale, and responsible recycling.</span>
        <a href="/admin">Operations</a>
      </div>
    </footer>
  );
}
