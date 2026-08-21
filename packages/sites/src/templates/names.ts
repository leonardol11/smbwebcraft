export const TEMPLATES = ["services", "food_salon"] as const;

export type TemplateName = (typeof TEMPLATES)[number];
