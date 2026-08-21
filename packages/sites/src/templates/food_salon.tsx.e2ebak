import { renderToStaticMarkup } from "react-dom/server.edge";
import type { SiteConfig } from "../schema.js";
import { PageShell, wrapHtml } from "./shared.js";

function FoodSalonPage({ config }: { config: SiteConfig }) {
  const accent = config.primaryColor ?? "#b45309";
  return (
    <PageShell
      config={config}
      title={config.name}
      themeClass="template-food-salon"
      extraStyles={`
        :root { --primary: ${accent}; }
        .template-food-salon .hero {
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, #fff7ed), #fff7ed);
        }
        .template-food-salon h1 { font-family: Georgia, "Times New Roman", serif; }
        .template-food-salon h2 {
          font-family: Georgia, "Times New Roman", serif;
          border-bottom: 2px solid color-mix(in srgb, var(--primary) 35%, white);
          padding-bottom: 0.35rem;
        }
        .template-food-salon .welcome-banner {
          background: color-mix(in srgb, var(--primary) 10%, white);
          border-left: 4px solid var(--primary);
          padding: 1rem 1.25rem;
          border-radius: 0.5rem;
        }
      `}
    >
      <section id="welcome">
        <div className="container">
          <div className="welcome-banner">
            <p>
              Welcome to {config.name}. Walk-ins welcome during business hours, or reach us at{" "}
              {config.phone}.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

export function buildHtml(config: SiteConfig): string {
  return wrapHtml(renderToStaticMarkup(<FoodSalonPage config={config} />));
}
