"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import {
  listComplaints,
  type ComplaintListItem,
} from "@/lib/complaintApi";

function statusStyle(status: string): { label: string; color: string } {
  switch (status) {
    case "new":
      return { label: "New", color: "bg-blue-950/40 text-blue-300 border-blue-900/40" };
    case "investigating":
      return { label: "Investigating", color: "bg-amber-950/40 text-amber-300 border-amber-900/40" };
    case "resolved":
      return { label: "Resolved", color: "bg-green-950/40 text-green-300 border-green-900/40" };
    case "rejected":
      return { label: "Rejected", color: "bg-red-950/40 text-red-300 border-red-900/40" };
    case "duplicate":
      return { label: "Duplicate", color: "bg-neutral-900/40 text-neutral-300 border-neutral-700" };
    default:
      return { label: status, color: "bg-neutral-900/40 text-neutral-300 border-neutral-700" };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyComplaintsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listComplaints();
      setComplaints(res.complaints ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/help"
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Report a problem
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold sm:text-3xl">My complaints</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Track the status of complaints you&apos;ve submitted.
        </p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {loading && complaints.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        )}

        {!loading && complaints.length === 0 && !error && (
          <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/30 p-8 text-center">
            <MessageSquare className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
            <div className="text-lg font-semibold">No complaints yet</div>
            <div className="mt-2 text-sm text-neutral-400">
              If something went wrong with a trip, you can report it.
            </div>
            <Link
              href="/help"
              className="mt-4 inline-block rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
            >
              Report a problem
            </Link>
          </div>
        )}

        {complaints.length > 0 && (
          <div className="mt-6 space-y-3">
            {complaints.map((c) => {
              const status = statusStyle(c.status);
              const lastUpdate =
                c.public_notes && c.public_notes.length > 0
                  ? c.public_notes[c.public_notes.length - 1].created_at
                  : c.updated_at;

              return (
                <Link
                  key={c.id}
                  href={`/help/my-complaints/${c.id}`}
                  className="block rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-neutral-100">
                      {c.reference}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.color}`}
                    >
                      {status.label}
                    </span>
                    <span className="ml-auto text-xs text-neutral-500">
                      {formatDate(c.created_at)}
                    </span>
                  </div>

                  <div className="mt-2 text-sm font-medium text-neutral-200">
                    {c.subject || c.category.replace(/_/g, " ")}
                  </div>

                  <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                    <span>Last update: {formatDate(lastUpdate)}</span>
                    {c.public_notes && c.public_notes.length > 0 && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <MessageSquare className="h-3 w-3" />
                        {c.public_notes.length}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}