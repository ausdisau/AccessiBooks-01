import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANNOTATION_USER_PLACEHOLDER,
  type Annotation,
  type TextAnnotation,
  type VoiceAnnotation,
} from "./annotation-types";
import {
  localAnnotationStorage,
  type AnnotationStorage,
} from "./annotation-storage";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface AddTextInput {
  body: string;
  pageIndex: number;
  anchorQuote?: string;
}

interface UpdateTextInput {
  body?: string;
  anchorQuote?: string | null;
}

interface AddVoiceInput {
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  pageIndex: number;
  anchorQuote?: string;
}

export interface UseAnnotationsResult {
  annotations: Annotation[];
  ready: boolean;
  addText(input: AddTextInput): TextAnnotation;
  updateText(id: string, patch: UpdateTextInput): void;
  addVoice(input: AddVoiceInput): VoiceAnnotation;
  remove(id: string): Annotation | undefined;
}

export function useAnnotations(
  bookId: string,
  storage: AnnotationStorage = localAnnotationStorage,
): UseAnnotationsResult {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [ready, setReady] = useState(false);
  const storageRef = useRef(storage);
  storageRef.current = storage;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    storageRef.current
      .list(bookId)
      .then((items) => {
        if (cancelled) return;
        const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
        setAnnotations(sorted);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAnnotations([]);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const addText = useCallback(
    ({ body, pageIndex, anchorQuote }: AddTextInput): TextAnnotation => {
      const now = Date.now();
      const note: TextAnnotation = {
        id: newId(),
        userId: ANNOTATION_USER_PLACEHOLDER,
        bookId,
        pageIndex,
        createdAt: now,
        updatedAt: now,
        anchorQuote: anchorQuote && anchorQuote.length > 0 ? anchorQuote : undefined,
        kind: "text",
        body,
      };
      setAnnotations((prev) => [note, ...prev]);
      void storageRef.current.save(note);
      return note;
    },
    [bookId],
  );

  const updateText = useCallback(
    (id: string, patch: UpdateTextInput) => {
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== id || a.kind !== "text") return a;
          const updated: TextAnnotation = {
            ...a,
            body: patch.body !== undefined ? patch.body : a.body,
            anchorQuote:
              patch.anchorQuote === undefined
                ? a.anchorQuote
                : patch.anchorQuote && patch.anchorQuote.length > 0
                  ? patch.anchorQuote
                  : undefined,
            updatedAt: Date.now(),
          };
          void storageRef.current.save(updated);
          return updated;
        }),
      );
    },
    [],
  );

  const addVoice = useCallback(
    ({
      audioBase64,
      mimeType,
      durationMs,
      pageIndex,
      anchorQuote,
    }: AddVoiceInput): VoiceAnnotation => {
      const now = Date.now();
      const note: VoiceAnnotation = {
        id: newId(),
        userId: ANNOTATION_USER_PLACEHOLDER,
        bookId,
        pageIndex,
        createdAt: now,
        updatedAt: now,
        anchorQuote: anchorQuote && anchorQuote.length > 0 ? anchorQuote : undefined,
        kind: "voice",
        audioBase64,
        mimeType,
        durationMs,
      };
      setAnnotations((prev) => [note, ...prev]);
      void storageRef.current.save(note);
      return note;
    },
    [bookId],
  );

  const remove = useCallback(
    (id: string): Annotation | undefined => {
      let removed: Annotation | undefined;
      setAnnotations((prev) => {
        removed = prev.find((a) => a.id === id);
        return prev.filter((a) => a.id !== id);
      });
      void storageRef.current.remove(bookId, id);
      return removed;
    },
    [bookId],
  );

  return { annotations, ready, addText, updateText, addVoice, remove };
}
