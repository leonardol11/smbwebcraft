import Link from "next/link";

export function LeadDetailLink({ href }: { href: string; leadId?: string }) {
  return (
    <Link href={href} className="text-xs text-primary hover:underline">
      View
    </Link>
  );
}
