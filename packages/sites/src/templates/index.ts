import type { SiteConfig } from "../schema.js";
import * as foodSalon from "./food_salon.js";
import * as services from "./services.js";
import type { TemplateName } from "./names.js";

export type TemplateBuilder = {
  buildHtml: (config: SiteConfig) => string;
};

export const TEMPLATE_BUILDERS: Record<TemplateName, TemplateBuilder> = {
  services,
  food_salon: foodSalon,
};
