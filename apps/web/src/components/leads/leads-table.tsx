"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { timeAgo } from "@/lib/utils";
import { BulkSuppressButton } from "./bulk-suppress";
import { LeadDetailLink } from "./lead-detail-link";
import { leadsHref } from "./params";

export type LeadTableRow = {
  id: string;
  businessName: string;
  zip: string;
  email: string | null;
  status: string;
  category: string | null;
  lastTouchAt: Date | string | null;
};

export function LeadsTable({
  rows,
  slug,
  searchParams,
}: {
  rows: LeadTableRow[];
  slug: string;
  searchParams: Record<string, string | undefined>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ids = rows.map((r) => r.id);
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <BulkSuppressButton leadIds={[...selected]} slug={slug} />
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="w-8">
              <input
                type="checkbox"
                aria-label="Select all on page"
                checked={allChecked}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(ids) : new Set())
                }
              />
            </TH>
            <TH>Business</TH>
            <TH>ZIP</TH>
            <TH>Email</TH>
            <TH>Status</TH>
            <TH>Category</TH>
            <TH>Last touch</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD>
                <input
                  type="checkbox"
                  aria-label={`Select ${r.businessName}`}
                  checked={selected.has(r.id)}
                  onChange={(e) => toggle(r.id, e.target.checked)}
                />
              </TD>
              <TD className="font-medium">{r.businessName}</TD>
              <TD className="font-mono text-xs">{r.zip}</TD>
              <TD className="text-xs">{r.email ?? "—"}</TD>
              <TD>
                <Badge variant="muted">{r.status}</Badge>
              </TD>
              <TD className="text-xs text-muted-foreground">{r.category ?? "—"}</TD>
              <TD className="text-xs text-muted-foreground">
                {r.lastTouchAt ? timeAgo(r.lastTouchAt) : "Never"}
              </TD>
              <TD>
                <LeadDetailLink href={leadsHref(slug, searchParams, { lead: r.id })} />
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                No leads match these filters.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
