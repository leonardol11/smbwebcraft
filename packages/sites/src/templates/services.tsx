import { renderToStaticMarkup } from "react-dom/server.edge";
import type { SiteConfig } from "../schema.js";
import { PageShell, wrapHtml } from "./shared.js";

function ServicesPage({ config }: { config: SiteConfig }) {
  return (
    <PageShell
      config={config}
      title={config.name}
      themeClass="template-services"
      extraStyles={`
        .template-services .hero { border-bottom: 4px solid var(--primary); }
        .template-services h2 { color: var(--primary); }
      `}
    >
      <section id="welcome">
        <div className="container">
          <p className="lead">
            Professional services you can trust. Call {config.phone} to schedule your visit.
          </p>
        </div>
      </section>
    </PageShell>
  );
}

export function buildHtml(config: SiteConfig): string {
  return wrapHtml(renderToStaticMarkup(<ServicesPage config={config} />));
}
