// Approving Claude (or another MCP app) to use First Mate as you. Reached
// from the app's sign-in; the proxy sends anyone signed out to log in first.
import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readAuthorize } from "@/lib/oauth";
import { currentMedicalMember } from "@/lib/players";
import { allow, deny } from "./actions";

export const metadata: Metadata = { title: "Connect Claude · First Mate" };

type Search = Record<string, string | string[] | undefined>;

export default function Page({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <Consent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Consent({ searchParams }: { searchParams: Promise<Search> }) {
  // The crew, on their own device: not Visitors, and not the kitchen screen.
  await currentMedicalMember();
  const query = new URLSearchParams(Object.entries(await searchParams).map(([k, v]) => [k, String(v ?? "")])).toString();
  const request = readAuthorize(new URLSearchParams(query));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Connect {typeof request === "string" ? "an app" : request.client === "localhost" || request.client === "127.0.0.1" ? "Claude Code" : "Claude"}?</CardTitle>
        <CardDescription>
          {typeof request === "string"
            ? request
            : "It will be able to read and change the Logbook and Duties, and read the Galley, as you."}
        </CardDescription>
      </CardHeader>
      {typeof request !== "string" && (
        <CardContent className="flex gap-2">
          <form action={allow.bind(null, query)}>
            <Button type="submit">Allow</Button>
          </form>
          <form action={deny.bind(null, query)}>
            <Button type="submit" variant="outline">
              Cancel
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
