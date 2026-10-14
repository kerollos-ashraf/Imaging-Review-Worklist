import type { PageRequest, Reviewer, Study, StudyFilter, StudyPage } from './study';

export interface StudyReader {
  list(filter: StudyFilter, page: PageRequest): Promise<StudyPage>;
  findById(id: string): Promise<Study | null>;
}

/**
 * Each write is a single conditional update. A null result means the row no longer
 * matched the expected version/state; the caller re-reads to learn why.
 */
export interface StudyWriter {
  claim(id: string, reviewerId: string, expectedVersion: number): Promise<Study | null>;
  complete(
    id: string,
    reviewerId: string,
    expectedVersion: number,
    reviewNote: string,
  ): Promise<Study | null>;
}

export interface ReviewerDirectory {
  list(): Promise<Reviewer[]>;
  exists(reviewerId: string): Promise<boolean>;
}

/** Resolves a known study id to an absolute path from a fixed mapping. */
export interface StudyFileResolver {
  resolve(studyId: string): Promise<string | null>;
}

export interface HealthProbe {
  check(): Promise<void>;
}
