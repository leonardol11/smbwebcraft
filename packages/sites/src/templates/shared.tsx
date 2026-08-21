import type { ReactNode } from "react";
import type { SiteConfig } from "../schema.js";

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function sortHours(hours: Record<string, string>): [string, string][] {
  const entries = Object.entries(hours);
  return entries.sort(([a], [b]) => {
    const ai = DAY_ORDER.indexOf(a);
    const bi = DAY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function fullAddress(config: SiteConfig): string {
  return `${config.address}, ${config.city}, ${config.state} ${config.zip}`;
}

export function mapEmbedUrl(mapQuery: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;
}

type PageOptions = {
  config: SiteConfig;
  title: string;
  themeClass: string;
  children: ReactNode;
  extraStyles?: string;
};

export function PageShell({ config, title, themeClass, children, extraStyles = "" }: PageOptions) {
  const primary = config.primaryColor ?? "#2563eb";
  const mapSrc = config.mapEmbedUrl ?? (config.mapQuery ? mapEmbedUrl(config.mapQuery) : null);
  const hours = sortHours(config.hours);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={`${config.tagline} ${config.name} in ${config.city}, ${config.state}.`} />
        <link
          rel="icon"
          href={`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='${encodeURIComponent(primary)}'/%3E%3C/svg%3E`}
        />
        <style>{`
          :root { --primary: ${primary}; --text: #111827; --muted: #4b5563; --bg: #ffffff; --surface: #f9fafb; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--text); background: var(--bg); line-height: 1.6; }
          a { color: var(--primary); }
          a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible {
            outline: 3px solid var(--primary); outline-offset: 2px;
          }
          .skip { position: absolute; left: 0.75rem; top: 0.75rem; transform: translateY(-150%); background: var(--primary); color: #fff; padding: 0.5rem 0.75rem; border-radius: 0.5rem; z-index: 10; }
          .skip:focus { transform: none; }
          .container { width: min(1100px, 100% - 2rem); margin-inline: auto; }
          .hero { padding: 4rem 0 3rem; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, white), white); }
          .hero h1 { margin: 0 0 0.5rem; font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; }
          .hero p { margin: 0; font-size: clamp(1.1rem, 2.5vw, 1.35rem); color: var(--muted); max-width: 48rem; }
          section { padding: 3rem 0; }
          main > section:nth-of-type(even) { background: var(--surface); }
          h2 { margin: 0 0 1rem; font-size: 1.75rem; }
          ul { margin: 0; padding-left: 1.25rem; }
          .grid-2 { display: grid; gap: 2rem; }
          @media (min-width: 768px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
          .gallery { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
          .gallery img { width: 100%; height: auto; aspect-ratio: 4/3; object-fit: cover; border-radius: 0.75rem; }
          .contact-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.5rem; }
          form { display: grid; gap: 0.75rem; margin-top: 1rem; }
          label { display: grid; gap: 0.25rem; font-weight: 600; }
          input, textarea, button { font: inherit; }
          input, textarea { width: 100%; min-height: 44px; padding: 0.65rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; }
          button { background: var(--primary); color: white; border: 0; min-height: 44px; padding: 0.75rem 1rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; }
          .map iframe { width: 100%; height: 320px; border: 0; border-radius: 0.75rem; }
          footer { padding: 2rem 0; text-align: center; color: var(--muted); font-size: 0.95rem; }
          ${extraStyles}
        `}</style>
      </head>
      <body className={themeClass}>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="hero">
          <div className="container">
            <h1>{config.name}</h1>
            <p>{config.tagline}</p>
          </div>
        </header>
        <main id="main">
          {children}
          <section id="about">
            <div className="container">
              <h2>About</h2>
              <p>{config.about}</p>
            </div>
          </section>
          <section id="services">
            <div className="container">
              <h2>Services</h2>
              <ul>
                {config.services.map((service) => (
                  <li key={service}>{service}</li>
                ))}
              </ul>
            </div>
          </section>
          <section id="hours">
            <div className="container">
              <h2>Hours</h2>
              <ul className="hours-list">
                {hours.map(([day, value]) => (
                  <li key={day}>
                    <strong>{day}:</strong> {value}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section id="contact">
            <div className="container grid-2">
              <div>
                <h2>Contact</h2>
                <p>
                  <strong>Phone:</strong>{" "}
                  <a href={`tel:${config.phone.replace(/\s+/g, "")}`}>{config.phone}</a>
                </p>
                {config.email ? (
                  <p>
                    <strong>Email:</strong> <a href={`mailto:${config.email}`}>{config.email}</a>
                  </p>
                ) : null}
                <p>
                  <strong>Address:</strong> {fullAddress(config)}
                </p>
                <p>
                  <strong>Contact:</strong>{" "}
                  <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
                </p>
              </div>
              <div className="contact-card">
                <h3>Send a message</h3>
                <form action={`mailto:${config.contactEmail}`} method="post" encType="text/plain">
                  <label htmlFor="contact-name">
                    Your name
                    <input id="contact-name" type="text" name="name" autoComplete="name" required />
                  </label>
                  <label htmlFor="contact-body">
                    Message
                    <textarea id="contact-body" name="body" rows={4} required />
                  </label>
                  <button type="submit">Email {config.name}</button>
                </form>
              </div>
            </div>
          </section>
          {config.gallery.length > 0 ? (
            <section id="gallery">
              <div className="container">
                <h2>Gallery</h2>
                <div className="gallery">
                  {config.gallery.map((src, index) => (
                    <img
                      key={src}
                      src={src}
                      alt={`${config.name} gallery photo ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      width={800}
                      height={600}
                    />
                  ))}
                </div>
              </div>
            </section>
          ) : null}
          {mapSrc ? (
            <section id="map" className="map">
              <div className="container">
                <h2>Find us</h2>
                <iframe
                  title={`Map for ${config.name}`}
                  src={mapSrc}
                  width={600}
                  height={320}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </section>
          ) : null}
        </main>
        <footer>
          <div className="container">
            &copy; {config.name} &middot; {fullAddress(config)}
          </div>
        </footer>
      </body>
    </html>
  );
}

const CAMEL_ATTRS: [RegExp, string][] = [
  [/\bcharSet=/g, "charset="],
  [/\bencType=/g, "enctype="],
  [/\breferrerPolicy=/g, "referrerpolicy="],
  [/\bhtmlFor=/g, "for="],
  [/\bautoComplete=/g, "autocomplete="],
];

export function wrapHtml(markup: string): string {
  let html = markup;
  for (const [from, to] of CAMEL_ATTRS) html = html.replace(from, to);
  return `<!DOCTYPE html>${html}`;
}
