import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { SCREENS } from "@/components/screens";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SafePath AI — Mobile App Screens" },
      { name: "description", content: "SafePath AI: smart emergency and intelligent navigation mobile app UI screens." },
      { property: "og:title", content: "SafePath AI — Mobile App Screens" },
      { property: "og:description", content: "Smart emergency & intelligent navigation. Your safety, our priority." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto grid max-w-[2200px] grid-cols-[repeat(auto-fill,minmax(250px,1fr))] justify-items-center gap-x-5 gap-y-8">
        {SCREENS.map(([title, Screen]) => (
          <section key={title} className="flex flex-col items-center gap-3">
            <h2 className="font-display text-[18px] text-foreground">{title}</h2>
            <Screen />
          </section>
        ))}
      </div>
      <p className="mt-10 flex items-center justify-center gap-2 font-display text-[16px]">
        <Shield className="h-4 w-4 text-primary" />SafePath AI — Your Safety, Our Priority
      </p>
    </main>
  );
}
