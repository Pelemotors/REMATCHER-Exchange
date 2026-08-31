import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return null;
  }

  const [dealers, matches, demands, aiLogs] = await Promise.all([
    prisma.dealer.findMany({ include: { _count: { select: { vehicles: true } } } }),
    prisma.candidateMatch.count(),
    prisma.demand.count(),
    prisma.aiOperationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="container-app py-8">
      <h1 className="mb-6 text-2xl font-bold">Admin</h1>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold">{dealers.length}</p>
          <p className="text-sm text-text-secondary">Dealers</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold">{matches}</p>
          <p className="text-sm text-text-secondary">Matches</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold">{demands}</p>
          <p className="text-sm text-text-secondary">Demands</p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold">Dealers</h2>
        <div className="space-y-2">
          {dealers.map((d) => (
            <div key={d.id} className="card flex justify-between">
              <div>
                <p className="font-medium">{d.businessName}</p>
                <p className="text-sm text-text-secondary">
                  {d.verificationStatus} · {d._count.vehicles} vehicles
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-semibold">AI Operations</h2>
        <div className="space-y-1 text-sm">
          {aiLogs.map((log) => (
            <div
              key={log.id}
              className={`rounded-lg px-3 py-2 ${log.success ? "bg-success-soft" : "bg-error-soft"}`}
            >
              {log.operation} · {log.model} · {log.success ? "OK" : log.errorMessage}
            </div>
          ))}
          {aiLogs.length === 0 && (
            <p className="text-text-muted">No AI operations yet</p>
          )}
        </div>
      </section>

      <Link href="/home" className="btn-secondary mt-8 inline-block">
        חזרה לאפליקציה
      </Link>
    </div>
  );
}
