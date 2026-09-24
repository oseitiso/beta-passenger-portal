"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  MessageSquare,
  Send,
  CheckCircle2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import {
  getComplaint,
  addComplaintNote,
  getAttachmentSignedUrl,
  type ComplaintDetail,
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

interface AttachmentMeta {
  path?: string;
  name?: string;
  size?: number;
  type?: string;
}

function AttachmentRow({ file }: { file: AttachmentMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadUrl = async () => {
    if (!file.path || url || loading) return;
    setLoading(true);
    const res = await getAttachmentSignedUrl(file.path);
    if (res.success && res.url) setUrl(res.url);
    setLoading(false);
  };

  useEffect(() => {
    loadUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path]);

  const isImage = file.type?.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  const Icon = isPdf ? FileText : isImage ? ImageIcon : Paperclip;

  const displayName = file.name ?? file.path?.split("/").pop() ?? "Attachment";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2">
      <Icon className="h-4 w-4 flex-shrink-0 text-neutral-500" />
      <span className="flex-1 truncate text-xs text-neutral-300">
        {displayName}
      </span>
      {file.size != null && (
        <span className="flex-shrink-0 text-[10px] text-neutral-500">
          {(file.size / 1024).toFixed(0)} KB
        </span>
      )}
      {loading && <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-neutral-500" />}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded p-0.5 text-orange-400 hover:bg-neutral-800 hover:text-orange-300"
          aria-label="Open attachment"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export default function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null);

  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getComplaint(id);
      if (res.error) {
        setError(res.error);
      } else if (res.complaint) {
        setComplaint(res.complaint);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load complaint");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddNote = async () => {
    if (noteText.trim().length < 2) return;
    setAddingNote(true);
    setNoteError(null);
    try {
      const res = await addComplaintNote(id, noteText.trim());
      if (!res.success) {
        setNoteError(res.error ?? "Failed to add note");
      } else {
        setNoteText("");
        await load();
      }
    } catch (e: unknown) {
      setNoteError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setAddingNote(false);
    }
  };

  const attachments = (complaint?.attachments ?? []) as AttachmentMeta[];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/help/my-complaints"
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            My complaints
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {loading && !complaint && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        )}

        {error && !complaint && (
          <div className="flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {complaint && (
          <>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold text-neutral-100">
                  {complaint.reference}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    statusStyle(complaint.status).color
                  }`}
                >
                  {statusStyle(complaint.status).label}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium text-neutral-200">
                {complaint.subject || complaint.category.replace(/_/g, " ")}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Submitted {formatDate(complaint.created_at)}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Your complaint
              </div>
              <div className="whitespace-pre-wrap text-sm text-neutral-200">
                {complaint.body}
              </div>
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <Paperclip className="h-3 w-3" />
                  Attachments ({attachments.length})
                </div>
                <div className="space-y-2">
                  {attachments.map((f, idx) => (
                    <AttachmentRow key={idx} file={f} />
                  ))}
                </div>
              </div>
            )}

            {complaint.status === "resolved" && complaint.resolution_note && (
              <div className="mt-4 rounded-xl border border-green-900/40 bg-green-950/20 p-4">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Resolved
                </div>
                <div className="text-sm text-green-100">
                  {complaint.resolution_note}
                </div>
              </div>
            )}

            <div className="mt-6">
              <div className="mb-3 text-sm font-semibold text-neutral-300">
                Updates
              </div>

              {complaint.public_notes.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-4 text-sm text-neutral-500">
                  No updates yet. We&apos;ll post here when there&apos;s news.
                </div>
              ) : (
                <div className="space-y-3">
                  {complaint.public_notes.map((note, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3"
                    >
                      <div className="text-xs text-neutral-500">
                        {formatDate(note.created_at)}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">
                        {note.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-300">
                <MessageSquare className="h-4 w-4" />
                Add a follow-up
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Add more details or ask a question…"
                className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none"
              />
              {noteError && (
                <div className="mt-2 text-xs text-red-400">{noteError}</div>
              )}
              <button
                onClick={handleAddNote}
                disabled={noteText.trim().length < 2 || addingNote}
                className="mt-2 flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {addingNote ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}