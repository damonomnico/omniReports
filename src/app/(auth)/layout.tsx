import { BarChart3, MapPin, TrendingUp } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const points = [
  { icon: TrendingUp, text: "Daily keyword rankings, tracked against your competitors" },
  { icon: BarChart3, text: "Search Console and Analytics traffic in one view" },
  { icon: MapPin, text: "Google Business Profile visibility and every link we build" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{
          background:
            "radial-gradient(900px 600px at 110% -10%, #2c525f 0%, transparent 55%), radial-gradient(800px 600px at -15% 115%, #23434e 0%, transparent 50%), linear-gradient(155deg, #122831 0%, #1e3a44 55%, #0f2129 100%)",
        }}
      >
        <Logo />
        <div className="max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight">
            See exactly what your SEO is{" "}
            <span className="text-lime">doing for you.</span>
          </h1>
          <ul className="mt-8 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[15px] text-brand-100">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-lime" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-300">Reporting platform by omniSEO</p>
      </aside>

      <main className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo tone="light" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
