import { z } from "zod";

export const siteConfigSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
  about: z.string().min(1),
  services: z.array(z.string().min(1)).min(1),
  hours: z.record(z.string(), z.string()),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  mapQuery: z.string().min(1).optional(),
  /** Full iframe src; overrides the keyless maps.google.com embed built from mapQuery. */
  mapEmbedUrl: z.string().url().optional(),
  gallery: z.array(z.string().url()).default([]),
  contactEmail: z.string().email(),
  primaryColor: z.string().optional(),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;
