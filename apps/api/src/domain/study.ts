export const STUDY_STATUSES = ['Unassigned', 'InReview', 'Completed'] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** Public study shape. Never contains the file reference or DICOM tags. */
export interface Study {
  id: string;
  modality: string;
  createdAt: string;
  status: StudyStatus;
  ownerId: string | null;
  reviewNote: string | null;
  version: number;
}

export interface StudyFilter {
  status?: StudyStatus;
  modality?: string;
}

export interface Reviewer {
  id: string;
  displayName: string;
}

export const MAX_LIST_RESULTS = 100;
export const REVIEW_NOTE_MAX_LENGTH = 1000;
