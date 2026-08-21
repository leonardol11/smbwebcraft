import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { env } from "@outreach/env";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function login(formData: FormData) {
  "use server";
  const password = formData.get("password");
  const next = String(formData.get("next") || "/overview");
  if (typeof password !== "string" || password !== env().ADMIN_PASSWORD) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const token = await createSessionToken(env().SESSION_SECRET);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/") ? next : "/overview");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Outreach admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={login} className="flex flex-col gap-3">
            <input type="hidden" name="next" value={params.next ?? "/overview"} />
            <Input
              type="password"
              name="password"
              placeholder="Admin password"
              autoFocus
              required
            />
            {params.error ? (
              <p className="text-xs text-destructive">Wrong password, try again.</p>
            ) : null}
            <Button type="submit">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
