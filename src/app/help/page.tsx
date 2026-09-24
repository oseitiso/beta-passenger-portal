"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import {
  COMPLAINT_CATEGORIES,
  createComplaint,
  uploadComplaintAttachment,
  updateComplaintAttachments,
  ATTACHMENT_LIMITS,
  type ComplaintCategory,
  type CreateComplaintResult,
  type UploadedAttachment,
} from "@/lib/complaintApi";

function HelpPageInner() {
  const searchParams = useSearchParams();
  const handoffFromUrl = searchParams.get("handoff") ?? "";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<ComplaintCategory | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<CreateComplaintResult | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedName = localStorage.getItem("b-eta-reporter-name");
    const savedPhone = localStorage.getItem("b-eta-reporter-phone");
    if (savedName) setName(savedName);
    if (savedPhone) setPhone(savedPhone);
  }, []);

  const canSubmit =
    category !== "" && body.trim().length >= 10 && !submitting;

  const handleFilePick = (picked: FileList | null) => {
    if (!picked) return;
    const next: File[] = [];
    for (const file of Array.from(picked)) {
      if (files.length + next.length >= ATTACHMENT_LIMITS.maxFiles) break;
      if (file.size > ATTACHMENT_LIMITS.maxBytes) {
        alert(`${file.name} is too large (max 2 MB)`);
        continue;
      }
      if (!ATTACHMENT_LIMITS.allowedTypes.includes(file.type)) {
        alert(`${file.name}: only JPG, PNG, or PDF allowed`);
        continue;
      }
      next.push(file);
    }
    setFiles((prev) => [...prev, ...next].slice(0, ATTACHMENT_LIMITS.maxFiles));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);
    setResult(null);
    setProgress("Submitting complaint…");

    try {
      const res = await createComplaint({
        category: category as ComplaintCategory,
        subject: subject.trim() || undefined,
        body: body.trim(),
        reporter_name: name.trim() || undefined,
        reporter_phone: phone.trim() || undefined,
        handoff_id: handoffFromUrl || undefined,
      });

      if (!res.success || !res.complaint_id) {
        setErrorMsg(res.error ?? "Could not submit complaint. Please try again.");
        setSubmitting(false);
        setProgress("");
        return;
      }

      if (typeof window !== "undefined") {
        if (name.trim()) localStorage.setItem("b-eta-reporter-name", name.trim());
        if (phone.trim()) localStorage.setItem("b-eta-reporter-phone", phone.trim());
      }

      // Upload attachments
      if (files.length > 0) {
        const uploaded: UploadedAttachment[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setProgress(`Uploading ${i + 1} of ${files.length}…`);
          const up = await uploadComplaintAttachment(res.complaint_id, file);
          if (up.success && up.path) {
            uploaded.push({
              path: up.path,
              name: file.name,
              size: file.size,
              type: file.type,
            });
          } else {
            console.warn("[help] attachment upload failed:", up.error);
          }
        }

        if (uploaded.length > 0) {
          setProgress("Linking attachments…");
          await updateComplaintAttachments(res.complaint_id, uploaded);
        }
      }

      setResult(res);
      setProgress("");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Network error. Please try again.");
      setProgress("");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success state ───────────────────────────────────────────────────
  if (result?.success) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link
              href="/map"
              className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to map
            </Link>
            <div className="text-xs text-neutral-500">Report a problem</div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-8">
          <div className="rounded-2xl border border-green-900/40 bg-green-950/20 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-400" />
            <div className="text-xl font-bold text-green-100">
              We received your complaint
            </div>
            <div className="mt-2 text-sm text-green-200/80">Reference:</div>
            <div className="mt-1 font-mono text-2xl font-bold tracking-wider text-green-300">
              {result.reference}
            </div>
            <div className="mt-4 text-sm text-green-200/80">
              We&apos;ll get back to you within 24 hours.
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/help/my-complaints"
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
              >
                Track it
              </Link>
              <Link
                href="/map"
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
              >
                Done
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Form state ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link
            href="/map"
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to map
          </Link>
          <Link
            href="/help/my-complaints"
            className="text-xs text-orange-400 hover:text-orange-300"
          >
            My complaints →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Report a problem</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Tell us what went wrong. We&apos;ll respond within 24 hours.
        </p>

        {handoffFromUrl && (
          <div className="mt-4 rounded-lg border border-orange-900/40 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
            This complaint will be linked to your current booking.
          </div>
        )}

        {/* Category */}
        <div className="mt-6">
          <div className="mb-2 text-sm font-medium text-neutral-300">
            What went wrong?
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {COMPLAINT_CATEGORIES.map((cat) => {
              const selected = category === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? "border-orange-600 bg-orange-600/10"
                      : "border-neutral-800 bg-neutral-900/40 hover:border-neutral-700"
                  }`}
                >
                  <div
                    className={`text-sm font-semibold ${
                      selected ? "text-orange-300" : "text-neutral-100"
                    }`}
                  >
                    {cat.label}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {cat.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subject */}
        <div className="mt-6">
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Short summary <span className="text-neutral-500">(optional)</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Bus never arrived"
            maxLength={120}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none"
          />
        </div>

        {/* Body */}
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Describe it
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="What happened? When? Where?"
            className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none"
          />
          <div className="mt-1 text-xs text-neutral-500">
            {body.trim().length < 10
              ? `At least 10 characters (${body.trim().length}/10)`
              : `${body.trim().length} characters`}
          </div>
        </div>

        {/* Name + Phone */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name Surname"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+26771234567"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Attachments */}
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-neutral-300">
            Attach photos <span className="text-neutral-500">(optional, max 3)</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            onChange={(e) => handleFilePick(e.target.files)}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= ATTACHMENT_LIMITS.maxFiles}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-900/30 px-4 py-3 text-sm text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-900/60 disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
            {files.length === 0
              ? "Add photos or PDFs"
              : `${files.length} file${files.length === 1 ? "" : "s"} attached`}
          </button>

          {files.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2"
                >
                  {f.type === "application/pdf" ? (
                    <FileText className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                  ) : (
                    <ImageIcon className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                  )}
                  <span className="flex-1 truncate text-xs text-neutral-300">
                    {f.name}
                  </span>
                  <span className="flex-shrink-0 text-[10px] text-neutral-500">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="flex-shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>{errorMsg}</div>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress || "Submitting…"}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit complaint
            </>
          )}
        </button>
      </main>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-neutral-950">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      }
    >
      <HelpPageInner />
    </Suspense>
  );
}