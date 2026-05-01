import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Upload, XCircle } from "lucide-react";
import clsx from "clsx";
import { uploadFiles } from "../api";

type UploadResult = {
  status: string;
  source: string;
  activities_new: number;
  files_parsed: number;
  files_skipped: number;
  skipped: { name: string; reason: string }[];
  duration_ms: number;
};

const ACCEPTED = ".fit,.tcx,.gpx";

export default function WorkoutFileUpload({
  onComplete,
}: {
  onComplete?: (r: UploadResult) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await uploadFiles<UploadResult>("/sync/upload", files);
      setResult(r);
      onComplete?.(r);
      window.dispatchEvent(new CustomEvent("fitfuel:synced"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[15px] font-semibold text-slate-100">
            Upload workout files
          </div>
          <div className="text-[13px] text-slate-400 mt-0.5">
            Drop <code className="text-slate-300">.fit</code>,{" "}
            <code className="text-slate-300">.tcx</code>, or{" "}
            <code className="text-slate-300">.gpx</code> files exported from
            Garmin Connect, Strava, or any device. No login needed.
          </div>
        </div>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) void send(files);
        }}
        className={clsx(
          "block rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          "px-6 py-8 text-center",
          dragOver
            ? "border-brand-500/70 bg-brand-500/5"
            : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/30",
          busy && "opacity-60 pointer-events-none"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void send(files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-2">
          {busy ? (
            <Loader2 className="h-7 w-7 text-brand-400 animate-spin" strokeWidth={1.5} />
          ) : (
            <Upload className="h-7 w-7 text-slate-400" strokeWidth={1.5} />
          )}
          <div className="text-[14px] text-slate-300">
            {busy
              ? "Parsing and importing…"
              : dragOver
              ? "Drop to import"
              : "Drag files here, or click to browse"}
          </div>
          {!busy && (
            <div className="text-[12px] text-slate-500">
              Multiple files OK · up to 25 MB each
            </div>
          )}
        </div>
      </label>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">{error}</div>
        </div>
      )}

      {result && !error && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-[13px] text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Imported{" "}
            <span className="font-semibold text-emerald-200">
              {result.activities_new}
            </span>{" "}
            activit{result.activities_new === 1 ? "y" : "ies"}
            {result.files_skipped > 0 && (
              <span className="text-slate-500">
                · {result.files_skipped} skipped
              </span>
            )}
          </div>
          {result.skipped.length > 0 && (
            <ul className="text-[12px] text-slate-400 space-y-1 pl-6 list-disc list-outside marker:text-slate-600">
              {result.skipped.map((s, i) => (
                <li key={i} className="break-all">
                  <span className="text-slate-300">{s.name}</span> — {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details className="mt-4 group">
        <summary className="cursor-pointer text-[12px] text-slate-500 hover:text-slate-300 select-none flex items-center gap-1.5">
          <FileUp className="h-3.5 w-3.5" />
          How to export from Garmin Connect
        </summary>
        <ol className="mt-2 text-[12px] text-slate-400 space-y-1 pl-6 list-decimal list-outside marker:text-slate-600">
          <li>
            Open the activity at{" "}
            <a
              href="https://connect.garmin.com/modern/activities"
              target="_blank"
              rel="noreferrer"
              className="text-brand-400 hover:text-brand-300 underline"
            >
              connect.garmin.com
            </a>
          </li>
          <li>Click the gear icon in the top-right of the activity</li>
          <li>
            Choose <strong>Export to Original</strong> (FIT — best fidelity),{" "}
            <strong>TCX</strong>, or <strong>GPX</strong>
          </li>
          <li>Drop the downloaded file above</li>
        </ol>
      </details>
    </div>
  );
}
