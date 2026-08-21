import { describe, expect, it } from "vitest";
import { buildSite, TEMPLATES } from "./index.js";
import { sampleSiteConfig } from "./fixtures/sample-config.js";

describe("@outreach/sites templates", () => {
  it.each(TEMPLATES)("%s template includes every required section", (template) => {
    const html = buildSite(template, sampleSiteConfig);

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('lang="en"');
    expect(html).toContain("charset=");
    expect(html).toContain('name="viewport"');
    expect(html).toContain('name="description"');

    // Name and tagline
    expect(html).toContain(sampleSiteConfig.name);
    expect(html).toContain(sampleSiteConfig.tagline);

    // Services
    expect(html).toContain('id="services"');
    for (const service of sampleSiteConfig.services) {
      expect(html).toContain(service);
    }

    // Hours
    expect(html).toContain('id="hours"');
    for (const [day, value] of Object.entries(sampleSiteConfig.hours)) {
      expect(html).toContain(day);
      expect(html).toContain(value);
    }

    // Phone (display text and tel: link)
    expect(html).toContain(sampleSiteConfig.phone);
    expect(html).toContain("tel:");

    // Address
    expect(html).toContain(sampleSiteConfig.address);
    expect(html).toContain(sampleSiteConfig.city);
    expect(html).toContain(sampleSiteConfig.zip);

    // Map embed
    expect(html).toContain('id="map"');
    expect(html).toContain("maps.google.com/maps?q=");
    expect(html).toContain("<iframe");

    // Gallery
    expect(html).toContain('id="gallery"');
    for (const src of sampleSiteConfig.gallery) {
      expect(html).toContain(src);
    }

    // Contact form that emails the owner
    expect(html).toContain('id="contact"');
    expect(html).toContain("<form");
    expect(html).toContain(`mailto:${sampleSiteConfig.contactEmail}`);
  });

  it("builds deterministically from the same JSON config", () => {
    for (const template of TEMPLATES) {
      const first = buildSite(template, sampleSiteConfig);
      const second = buildSite(template, structuredClone(sampleSiteConfig));
      expect(second).toBe(first);
    }
  });

  it("omits map and gallery sections when not configured", () => {
    const { mapQuery: _mapQuery, ...rest } = sampleSiteConfig;
    const html = buildSite("services", { ...rest, gallery: [] });
    expect(html).not.toContain('id="map"');
    expect(html).not.toContain('id="gallery"');
    expect(html).toContain('id="contact"');
  });

  it("sorts hours in weekday order regardless of config key order", () => {
    const html = buildSite("services", {
      ...sampleSiteConfig,
      hours: { Sunday: "Closed", Monday: "9:00 AM – 5:00 PM" },
    });
    expect(html.indexOf("Monday")).toBeLessThan(html.indexOf("Sunday"));
  });

  it("rejects an invalid config", () => {
    expect(() =>
      buildSite("services", { ...sampleSiteConfig, contactEmail: "not-an-email" }),
    ).toThrow();
    expect(() => buildSite("services", { ...sampleSiteConfig, services: [] })).toThrow();
  });
});
