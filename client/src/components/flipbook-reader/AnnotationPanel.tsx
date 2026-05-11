import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic,
  Pencil,
  Quote,
  Save,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import type { AnnotationPanelProps } from "./flipbook-types";
import type { Annotation, TextAnnotation } from "./annotation-types";
import { useAnnotations } from "./use-annotations";
import { useVoiceRecorder } from "./use-voice-recorder";

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AnnotationPanel({
  open,
  onClose,
  bookId,
  currentPage,
  getSelectedText,
  onAnnounce,
  storage,
}: AnnotationPanelProps) {
  const { annotations, ready, addText, updateText, addVoice, remove } =
    useAnnotations(bookId, storage);
  const recorder = useVoiceRecorder();

  const [draftAnchor, setDraftAnchor] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAnchor, setEditAnchor] = useState("");
  const [editBody, setEditBody] = useState("");
  const [voiceAnchor, setVoiceAnchor] = useState("");

  const draftBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const editBodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep edit textarea focused when entering edit mode.
  useEffect(() => {
    if (editingId) editBodyRef.current?.focus();
  }, [editingId]);

  const sortedAnnotations = useMemo(
    () => [...annotations].sort((a, b) => b.updatedAt - a.updatedAt),
    [annotations],
  );

  if (!open) return null;

  const handleCaptureSelection = () => {
    const text = getSelectedText().trim();
    if (!text) {
      onAnnounce("No text is selected on the current page.");
      return;
    }
    setDraftAnchor(text);
    onAnnounce(`Captured ${text.length} character anchor from the page.`);
    draftBodyRef.current?.focus();
  };

  const handleClearAnchor = () => {
    setDraftAnchor("");
    onAnnounce("Cleared anchor quote.");
  };

  const handleSaveDraft = () => {
    const body = draftBody.trim();
    if (!body) {
      onAnnounce("Type a note before saving.");
      draftBodyRef.current?.focus();
      return;
    }
    addText({
      body,
      pageIndex: currentPage,
      anchorQuote: draftAnchor.trim() || undefined,
    });
    setDraftBody("");
    setDraftAnchor("");
    onAnnounce(`Note saved on page ${currentPage}.`);
  };

  const handleStartEdit = (note: TextAnnotation) => {
    setEditingId(note.id);
    setEditAnchor(note.anchorQuote ?? "");
    setEditBody(note.body);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditAnchor("");
    setEditBody("");
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const body = editBody.trim();
    if (!body) {
      onAnnounce("A note cannot be empty.");
      editBodyRef.current?.focus();
      return;
    }
    updateText(editingId, {
      body,
      anchorQuote: editAnchor.trim() ? editAnchor.trim() : null,
    });
    onAnnounce("Note updated.");
    handleCancelEdit();
  };

  const handleDelete = (a: Annotation) => {
    remove(a.id);
    onAnnounce(
      a.kind === "voice"
        ? `Voice note on page ${a.pageIndex} deleted.`
        : `Note on page ${a.pageIndex} deleted.`,
    );
    if (editingId === a.id) handleCancelEdit();
  };

  const handleStartRecording = async () => {
    if (!recorder.supported) {
      onAnnounce("Voice recording is not supported in this browser.");
      return;
    }
    const anchor = getSelectedText().trim();
    setVoiceAnchor(anchor);
    const ok = await recorder.start();
    if (ok) {
      onAnnounce(
        anchor
          ? "Recording voice note with anchor from selection."
          : "Recording voice note. Press Stop when finished.",
      );
    } else {
      onAnnounce(
        recorder.error
          ? `Could not start recording: ${recorder.error}`
          : "Could not start recording.",
      );
    }
  };

  const handleStopRecording = async () => {
    const result = await recorder.stop();
    if (!result) {
      onAnnounce("Voice recording could not be saved.");
      setVoiceAnchor("");
      return;
    }
    addVoice({
      audioBase64: result.dataUrl,
      mimeType: result.mimeType,
      durationMs: result.durationMs,
      pageIndex: currentPage,
      anchorQuote: voiceAnchor || undefined,
    });
    onAnnounce(
      `Voice note saved on page ${currentPage}, ${formatDuration(result.durationMs)} long.`,
    );
    setVoiceAnchor("");
  };

  return (
    <aside
      id="flipbook-annotations-panel"
      role="region"
      aria-label="Annotations"
      data-flipbook-panel="annotations"
      className="border-l w-80 max-w-full flex flex-col"
      style={{
        background: "var(--fb-surface)",
        color: "var(--fb-fg)",
        borderColor: "var(--fb-border)",
      }}
      data-testid="flipbook-annotations-panel"
    >
      <header
        className="flex items-center justify-between p-3 border-b"
        style={{ borderColor: "var(--fb-border)" }}
      >
        <h2 className="text-sm font-semibold">Annotations</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close annotations"
          data-testid="flipbook-annotations-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Written note composer */}
        <section
          aria-labelledby="flipbook-new-note-heading"
          className="rounded-md border p-3 space-y-2"
          style={{ borderColor: "var(--fb-border)", background: "var(--fb-page-bg)" }}
        >
          <h3
            id="flipbook-new-note-heading"
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--fb-muted)" }}
          >
            New note · page {currentPage}
          </h3>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCaptureSelection}
              data-testid="flipbook-annotations-capture-selection"
            >
              <Quote className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Use selection as anchor
            </Button>
            {draftAnchor && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleClearAnchor}
                data-testid="flipbook-annotations-clear-anchor"
              >
                Clear anchor
              </Button>
            )}
          </div>

          {draftAnchor && (
            <blockquote
              className="text-xs italic border-l-2 pl-2 py-1 max-h-24 overflow-y-auto"
              style={{
                borderColor: "var(--fb-border)",
                color: "var(--fb-muted)",
              }}
              data-testid="flipbook-annotations-anchor-preview"
            >
              {draftAnchor}
            </blockquote>
          )}

          <label className="block text-xs font-medium" htmlFor="flipbook-new-note-body">
            Note
          </label>
          <Textarea
            id="flipbook-new-note-body"
            ref={draftBodyRef}
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder="Write your note…"
            className="min-h-[80px] text-sm"
            data-testid="flipbook-annotations-body-input"
          />

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveDraft}
              disabled={!draftBody.trim()}
              data-testid="flipbook-annotations-save"
            >
              <Save className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Save note
            </Button>
          </div>
        </section>

        {/* Voice note recorder */}
        <section
          aria-labelledby="flipbook-voice-heading"
          className="rounded-md border p-3 space-y-2"
          style={{ borderColor: "var(--fb-border)", background: "var(--fb-page-bg)" }}
        >
          <h3
            id="flipbook-voice-heading"
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--fb-muted)" }}
          >
            Voice note
          </h3>

          {!recorder.supported ? (
            <p className="text-xs" style={{ color: "var(--fb-muted)" }} data-testid="flipbook-annotations-voice-unsupported">
              Voice recording is not available in this browser. You can still save written
              notes; voice notes will sync from a supported browser later.
            </p>
          ) : recorder.recording ? (
            <div className="space-y-2">
              <div
                className="text-xs flex items-center gap-2"
                role="status"
                aria-live="polite"
                data-testid="flipbook-annotations-recording-status"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                Recording · {formatDuration(recorder.elapsedMs)}
              </div>
              {voiceAnchor && (
                <blockquote
                  className="text-xs italic border-l-2 pl-2 py-1 max-h-20 overflow-y-auto"
                  style={{ borderColor: "var(--fb-border)", color: "var(--fb-muted)" }}
                >
                  {voiceAnchor}
                </blockquote>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStopRecording}
                  data-testid="flipbook-annotations-stop-recording"
                >
                  <Square className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Stop &amp; save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    recorder.cancel();
                    setVoiceAnchor("");
                    onAnnounce("Voice recording cancelled.");
                  }}
                  data-testid="flipbook-annotations-cancel-recording"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleStartRecording}
                data-testid="flipbook-annotations-start-recording"
              >
                <Mic className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Record voice note
              </Button>
              <span className="text-xs" style={{ color: "var(--fb-muted)" }}>
                Selection on the page becomes the anchor automatically.
              </span>
            </div>
          )}
          {recorder.error && !recorder.recording && (
            <p
              className="text-xs text-red-600"
              role="alert"
              data-testid="flipbook-annotations-voice-error"
            >
              {recorder.error}
            </p>
          )}
        </section>

        {/* List */}
        <section aria-labelledby="flipbook-notes-list-heading" className="space-y-2">
          <h3
            id="flipbook-notes-list-heading"
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--fb-muted)" }}
          >
            All notes ({sortedAnnotations.length})
          </h3>

          {!ready ? (
            <p className="text-xs" style={{ color: "var(--fb-muted)" }}>
              Loading notes…
            </p>
          ) : sortedAnnotations.length === 0 ? (
            <p
              className="text-xs"
              style={{ color: "var(--fb-muted)" }}
              data-testid="flipbook-annotations-empty"
            >
              No notes yet for this book. Capture a selection or record a voice note above.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="flipbook-annotations-list">
              {sortedAnnotations.map((note) => (
                <li
                  key={note.id}
                  className="rounded-md border p-3 space-y-2"
                  style={{
                    borderColor: "var(--fb-border)",
                    background: "var(--fb-page-bg)",
                  }}
                  data-testid={`flipbook-annotation-${note.id}`}
                >
                  <div
                    className="flex items-center justify-between text-[11px]"
                    style={{ color: "var(--fb-muted)" }}
                  >
                    <span>
                      {note.kind === "voice" ? (
                        <span className="inline-flex items-center gap-1">
                          <Volume2 className="h-3 w-3" aria-hidden="true" />
                          Voice
                        </span>
                      ) : (
                        "Note"
                      )}{" "}
                      · page {note.pageIndex} · {formatRelative(note.updatedAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      {note.kind === "text" && editingId !== note.id && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleStartEdit(note)}
                          aria-label={`Edit note on page ${note.pageIndex}`}
                          data-testid={`flipbook-annotation-edit-${note.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => handleDelete(note)}
                        aria-label={`Delete ${note.kind === "voice" ? "voice note" : "note"} on page ${note.pageIndex}`}
                        data-testid={`flipbook-annotation-delete-${note.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {note.anchorQuote && editingId !== note.id && (
                    <blockquote
                      className="text-xs italic border-l-2 pl-2 py-1"
                      style={{
                        borderColor: "var(--fb-border)",
                        color: "var(--fb-muted)",
                      }}
                    >
                      {note.anchorQuote}
                    </blockquote>
                  )}

                  {note.kind === "text" ? (
                    editingId === note.id ? (
                      <div className="space-y-2">
                        <label
                          className="block text-[11px] font-medium"
                          htmlFor={`flipbook-edit-anchor-${note.id}`}
                        >
                          Anchor quote (optional)
                        </label>
                        <Textarea
                          id={`flipbook-edit-anchor-${note.id}`}
                          value={editAnchor}
                          onChange={(e) => setEditAnchor(e.target.value)}
                          className="min-h-[40px] text-xs"
                        />
                        <label
                          className="block text-[11px] font-medium"
                          htmlFor={`flipbook-edit-body-${note.id}`}
                        >
                          Note
                        </label>
                        <Textarea
                          id={`flipbook-edit-body-${note.id}`}
                          ref={editBodyRef}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className="min-h-[60px] text-sm"
                          data-testid={`flipbook-annotation-edit-body-${note.id}`}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                            data-testid={`flipbook-annotation-edit-cancel-${note.id}`}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveEdit}
                            data-testid={`flipbook-annotation-edit-save-${note.id}`}
                          >
                            <Save className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p
                        className="text-sm whitespace-pre-wrap"
                        data-testid={`flipbook-annotation-body-${note.id}`}
                      >
                        {note.body}
                      </p>
                    )
                  ) : (
                    <div className="space-y-1">
                      <audio
                        controls
                        src={note.audioBase64}
                        className="w-full"
                        aria-label={`Voice note on page ${note.pageIndex}, ${formatDuration(note.durationMs)} long`}
                        data-testid={`flipbook-annotation-audio-${note.id}`}
                      />
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--fb-muted)" }}
                      >
                        Duration {formatDuration(note.durationMs)}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
