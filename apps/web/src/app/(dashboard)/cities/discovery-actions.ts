"use server";

import { revalidatePath } from "next/cache";
import { enqueueJob } from "@/jobs";

export async function enqueueDiscovery(campaignId: string, slug: string): Promise<void> {
  await enqueueJob("discovery.run", { campaignId });
  revalidatePath(`/cities/${slug}`);
}
