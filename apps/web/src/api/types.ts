export type StudyStatus = 'Unassigned' | 'InReview' | 'Completed';

export const STATUS_OPTIONS: readonly StudyStatus[] = ['Unassigned', 'InReview', 'Completed'];

export interface Study {
  id: string;
  modality: string;
  createdAt: string;
  status: StudyStatus;
  ownerId: string | null;
  reviewNote: string | null;
  version: number;
}

export interface Reviewer {
  id: string;
  displayName: string;
}

export interface StudyFilters {
  status: StudyStatus | '';
  modality: string;
}

export interface MutationInput {
  reviewerId: string;
  expectedVersion: number;
}

export interface CompleteInput extends MutationInput {
  reviewNote: string;
}

export const REVIEW_NOTE_MAX_LENGTH = 1000;
