export type AnnotationKind = "text" | "voice";

export interface BaseAnnotation {
  id: string;
  userId: string;
  bookId: string;
  pageIndex: number;
  createdAt: number;
  updatedAt: number;
  anchorQuote?: string;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: "text";
  body: string;
}

export interface VoiceAnnotation extends BaseAnnotation {
  kind: "voice";
  audioBase64: string;
  mimeType: string;
  durationMs: number;
}

export type Annotation = TextAnnotation | VoiceAnnotation;

export const ANNOTATION_USER_PLACEHOLDER = "local-user";
