import {
  InvalidStateError,
  NotFoundError,
  NotOwnerError,
  StaleVersionError,
  ValidationError,
} from '../errors/AppError';
import type {
  ReviewerDirectory,
  StudyFileResolver,
  StudyReader,
  StudyWriter,
} from '../domain/ports';
import type { PageRequest, Study, StudyFilter, StudyPage } from '../domain/study';
import { claimSchema, completionSchema, parseInput, studyFilterSchema } from './validation';
import type { ClaimInput } from './validation';

/** One page of studies together with the paging that produced it. */
export type StudyListResult = StudyPage & PageRequest;

export class StudyService {
  constructor(
    private readonly reader: StudyReader,
    private readonly writer: StudyWriter,
    private readonly reviewers: ReviewerDirectory,
    private readonly files: StudyFileResolver,
  ) {}

  /** `raw` is untrusted transport input (for example the parsed query string). */
  async listStudies(raw: unknown): Promise<StudyListResult> {
    const { page, pageSize, ...conditions } = parseInput(studyFilterSchema, raw);
    // Copy only the keys that were supplied: absent means "no condition".
    const filter: StudyFilter = Object.fromEntries(
      Object.entries(conditions).filter(([, value]) => value !== undefined),
    );
    const result = await this.reader.list(filter, { page, pageSize });
    return { ...result, page, pageSize };
  }

  async getStudy(id: string): Promise<Study> {
    const study = await this.reader.findById(id);
    if (!study) {
      throw new NotFoundError('Study not found');
    }
    return study;
  }

  async resolveFile(id: string): Promise<string> {
    const filePath = await this.files.resolve(id);
    if (filePath === null) {
      throw new NotFoundError('Study not found');
    }
    return filePath;
  }

  /** Validation order: input, study exists, expectedVersion, status, ownership. */
  async claim(studyId: string, raw: unknown): Promise<Study> {
    const input = parseInput(claimSchema, raw);
    await this.assertKnownReviewer(input.reviewerId);
    return this.runConditionalWrite(studyId, async () => {
      await this.assertClaimable(studyId, input);
      return this.writer.claim(studyId, input.reviewerId, input.expectedVersion);
    });
  }

  /** Validation order: input, study exists, expectedVersion, status, ownership. */
  async complete(studyId: string, raw: unknown): Promise<Study> {
    const input = parseInput(completionSchema, raw);
    await this.assertKnownReviewer(input.reviewerId);
    return this.runConditionalWrite(studyId, async () => {
      await this.assertCompletable(studyId, input);
      return this.writer.complete(
        studyId,
        input.reviewerId,
        input.expectedVersion,
        input.reviewNote,
      );
    });
  }

  /**
   * The conditional UPDATE is the real guard. If it matches no row, something
   * changed after our read, so the checks are re-run against fresh state to pick
   * the right error. If they somehow still pass, report the record as stale.
   */
  private async runConditionalWrite(
    studyId: string,
    attempt: () => Promise<Study | null>,
  ): Promise<Study> {
    const written = (await attempt()) ?? (await attempt());
    if (written) {
      return written;
    }
    throw new StaleVersionError(await this.getStudy(studyId));
  }

  /** An unknown reviewer is invalid input (400), so it is checked before the study. */
  private async assertKnownReviewer(reviewerId: string): Promise<void> {
    if (!(await this.reviewers.exists(reviewerId))) {
      throw new ValidationError('reviewerId is not a known reviewer');
    }
  }

  private async assertClaimable(studyId: string, input: ClaimInput): Promise<void> {
    const study = await this.getStudy(studyId);
    this.assertVersion(study, input.expectedVersion);
    if (study.status !== 'Unassigned') {
      throw new InvalidStateError('Only an Unassigned study can be claimed');
    }
  }

  private async assertCompletable(studyId: string, input: ClaimInput): Promise<void> {
    const study = await this.getStudy(studyId);
    this.assertVersion(study, input.expectedVersion);
    if (study.status !== 'InReview') {
      throw new InvalidStateError('Only an InReview study can be completed');
    }
    if (study.ownerId !== input.reviewerId) {
      throw new NotOwnerError('Only the owner can complete this study');
    }
  }

  private assertVersion(study: Study, expectedVersion: number): void {
    if (study.version !== expectedVersion) {
      throw new StaleVersionError(study);
    }
  }
}
