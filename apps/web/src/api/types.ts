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

export type SortOrder = 'asc' | 'desc';

/** Every condition is optional (an empty string means "any") and combined with AND. */
export interface StudyFilters {
  status: StudyStatus | '';
  modality: string;
  ownerId: string;
  /** Matches anywhere in the study name, ignoring case. */
  search: string;
  /** Direction of the created-date ordering. */
  order: SortOrder;
}

export const NO_FILTERS: StudyFilters = {
  status: '',
  modality: '',
  ownerId: '',
  search: '',
  order: 'asc',
};

/** 1-based page of the worklist. */
export interface PageRequest {
  page: number;
  pageSize: number;
}

/** One page of studies plus the number matching the filters across all pages. */
export type StatusCounts = Record<StudyStatus, number>;

export interface StudyPage {
  studies: Study[];
  total: number;
  /** All matching studies by status, across every page; the values sum to `total`. */
  statusCounts: StatusCounts;
}

/** Counts the given studies by status. */
export function countByStatus(studies: readonly Study[]): StatusCounts {
  const counts: StatusCounts = { Unassigned: 0, InReview: 0, Completed: 0 };
  for (const study of studies) {
    counts[study.status] += 1;
  }
  return counts;
}

export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50];
export const FIRST_PAGE: PageRequest = { page: 1, pageSize: 10 };

export interface MutationInput {
  reviewerId: string;
  expectedVersion: number;
}

export interface CompleteInput extends MutationInput {
  reviewNote: string;
}

export const REVIEW_NOTE_MAX_LENGTH = 1000;
