import type { SiteConfig } from "../schema.js";

export const sampleSiteConfig: SiteConfig = {
  name: "Bright Side Plumbing",
  tagline: "Fast, friendly plumbing for Austin homes",
  about:
    "Bright Side Plumbing has served Austin homeowners for over a decade with reliable repairs, installs, and emergency service.",
  services: ["Drain cleaning", "Water heater repair", "Leak detection", "Fixture installation"],
  hours: {
    Monday: "8:00 AM – 6:00 PM",
    Tuesday: "8:00 AM – 6:00 PM",
    Wednesday: "8:00 AM – 6:00 PM",
    Thursday: "8:00 AM – 6:00 PM",
    Friday: "8:00 AM – 5:00 PM",
    Saturday: "9:00 AM – 1:00 PM",
    Sunday: "Closed",
  },
  phone: "(512) 555-0199",
  email: "hello@brightsideplumbing.example",
  address: "1200 Congress Ave",
  city: "Austin",
  state: "TX",
  zip: "78701",
  mapQuery: "1200 Congress Ave, Austin, TX 78701",
  gallery: [
    "https://images.example.com/plumbing-1.jpg",
    "https://images.example.com/plumbing-2.jpg",
  ],
  contactEmail: "bookings@brightsideplumbing.example",
  primaryColor: "#2563eb",
};
