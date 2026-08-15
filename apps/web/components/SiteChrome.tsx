type SiteHeaderProps = {
  compact?: boolean;
};

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
            <span>Electronics deserve a useful next chapter.</span>
            <span className="utility-proof">Photo-based checks. Human review when needed.</span>
          </div>
        </div>
      )}
      <header className="site-header">
        <div className="site-header-inner">
          <Brand />
          <nav className="site-nav" aria-label="Primary navigation">
            <a href="/#how-it-works">How it works</a>
            <a href="/#what-you-get">What you get</a>
            <a href="/#why-secondcurrent">Why it matters</a>
          </nav>
          <a className="button button-primary header-cta" href="sms:+14155837575?&body=SELL">
            Text a photo
          </a>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <Brand />
          <p>Clearer evidence for safer electronics reuse.</p>
        </div>
        <div className="footer-links" aria-label="Footer navigation">
          <a href="/#how-it-works">How it works</a>
          <a href="/#what-you-get">Item passports</a>
          <a href="/admin">Operations</a>
        </div>
        <p className="footer-note">Built for reuse, repair, resale, and responsible recycling.</p>
      </div>
    </footer>
  );
}
