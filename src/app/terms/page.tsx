import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { PublicLayout } from "@/components/public/public-layout";
import { Surface } from "@/components/ui/brand-v2";
import { TERMS_DISPLAY } from "@/config/legal/versions";

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\))/g);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-v2-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          className="text-v2-warm underline underline-offset-2"
          dir={link[2].startsWith("mailto:") ? "ltr" : undefined}
        >
          {link[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default async function TermsPage() {
  const filePath = path.join(process.cwd(), "content/legal/terms-v1.0.md");
  const raw = await readFile(filePath, "utf8");
  const sections = raw
    .split(/\n(?=## )/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <PublicLayout>
      <main className="mx-auto max-w-3xl px-4 py-8 pb-16">
        <Surface depth="raised" className="space-y-6 p-5 sm:p-8">
          <header className="space-y-2 border-b border-v2-border pb-4">
            <h1 className="text-2xl font-bold text-v2-text-primary">
              {TERMS_DISPLAY.title}
            </h1>
            <p className="text-sm text-v2-text-secondary">
              {TERMS_DISPLAY.versionLabel} · עודכן {TERMS_DISPLAY.updatedAt}
            </p>
            <p className="text-sm text-v2-text-secondary">
              בעל השליטה: {TERMS_DISPLAY.controllerName},{" "}
              {TERMS_DISPLAY.controllerLocation}
            </p>
            <p className="text-sm">
              <a
                href={`mailto:${TERMS_DISPLAY.contactEmail}`}
                className="text-v2-warm underline underline-offset-2"
                dir="ltr"
              >
                {TERMS_DISPLAY.contactEmail}
              </a>
            </p>
          </header>

          <div className="space-y-6 text-[15px] leading-relaxed text-v2-text-secondary">
            {sections.map((section, idx) => {
              const lines = section.split("\n");
              const heading = lines[0]?.replace(/^#+\s*/, "") ?? "";
              const body = lines.slice(1).filter((l) => l.trim().length > 0);
              const isH1 = section.startsWith("# ") && !section.startsWith("## ");
              return (
                <section key={idx} className="space-y-2">
                  {isH1 ? null : (
                    <h2 className="text-lg font-semibold text-v2-text-primary">
                      {heading}
                    </h2>
                  )}
                  {isH1
                    ? null
                    : body.map((line, li) => (
                        <p key={li}>{renderInline(line)}</p>
                      ))}
                </section>
              );
            })}
          </div>

          <p className="pt-2 text-sm text-v2-text-muted">
            <Link href="/privacy" className="underline underline-offset-2">
              מדיניות פרטיות ו־AI
            </Link>
          </p>
        </Surface>
      </main>
    </PublicLayout>
  );
}
