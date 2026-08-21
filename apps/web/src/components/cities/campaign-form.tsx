import { createCampaign } from "@/app/(dashboard)/cities/actions";
import {
  BUSINESS_CATEGORIES,
  DEFAULT_CAMPAIGN_DAILY_CAP,
  MAX_CAMPAIGN_DAILY_CAP,
  labelForCategory,
} from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

export function CampaignForm({ marketId, slug }: { marketId: string; slug: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New campaign</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createCampaign} className="flex flex-col gap-3">
          <input type="hidden" name="marketId" value={marketId} />
          <input type="hidden" name="slug" value={slug} />
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Campaign name</Label>
              <Input name="name" placeholder="Downtown pilot" required className="mt-1" />
            </div>
            <div className="w-32">
              <Label>Daily cap (max {MAX_CAMPAIGN_DAILY_CAP})</Label>
              <Input
                name="dailyCap"
                type="number"
                min={1}
                max={MAX_CAMPAIGN_DAILY_CAP}
                defaultValue={DEFAULT_CAMPAIGN_DAILY_CAP}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>ZIP codes (paste, separated by spaces/commas/newlines)</Label>
            <Textarea name="zips" placeholder="78701 78704 78745" required className="mt-1" />
          </div>
          <div>
            <Label>Business categories</Label>
            <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {BUSINESS_CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="categories" value={cat} className="accent-current" />
                  {labelForCategory(cat)}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="self-start">
            Create campaign
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
