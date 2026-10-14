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

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** All conditions are combined with AND. */
export interface StudyFilter {
  status?: StudyStatus;
  modality?: string;
  ownerId?: string;
  /** Case-insensitive match anywhere in the study id. */
  search?: string;
  /** Direction of the createdAt (then id) ordering. Defaults to ascending. */
  order?: SortOrder;
}

export interface Reviewer {
  id: string;
  displayName: string;
}

/** The most studies one list response may carry, and the default page size. */
export const MAX_LIST_RESULTS = 100;

/** 1-based page of at most MAX_LIST_RESULTS rows. */
export interface PageRequest {
  page: number;
  pageSize: number;
}

export type StatusCounts = Record<StudyStatus, number>;

export interface StudyPage {
  studies: Study[];
  /** Number of studies matching the filter across all pages. */
  total: number;
  /** The same matching studies broken down by status; the values sum to `total`. */
  statusCounts: StatusCounts;
}
export const REVIEW_NOTE_MAX_LENGTH = 1000;
