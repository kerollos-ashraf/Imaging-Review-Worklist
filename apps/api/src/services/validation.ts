import { z } from 'zod';
import { ValidationError } from '../errors/AppError';
import {
  MAX_LIST_RESULTS,
  REVIEW_NOTE_MAX_LENGTH,
  SORT_ORDERS,
  STUDY_STATUSES,
} from '../domain/study';

const NOT_AN_OBJECT = 'Request body must be a JSON object';
const VERSION_MESSAGE = 'expectedVersion must be a positive integer';
const NOTE_MESSAGE = `reviewNote must be 1-${REVIEW_NOTE_MAX_LENGTH} characters after trimming`;

const PAGE_MESSAGE = 'page must be a positive integer';
const PAGE_SIZE_MESSAGE = `pageSize must be an integer from 1 to ${MAX_LIST_RESULTS}`;

const reviewerId = z
  .string({
    required_error: 'reviewerId is required',
    invalid_type_error: 'reviewerId must be a string',
  })
  .trim()
  .min(1, 'reviewerId is required');

const expectedVersion = z
  .number({ required_error: 'expectedVersion is required', invalid_type_error: VERSION_MESSAGE })
  .int(VERSION_MESSAGE)
  .min(1, VERSION_MESSAGE);

const reviewNote = z
  .string({
    required_error: 'reviewNote is required',
    invalid_type_error: 'reviewNote must be a string',
  })
  .trim()
  .min(1, NOTE_MESSAGE)
  .max(REVIEW_NOTE_MAX_LENGTH, NOTE_MESSAGE);

const objectErrors = { required_error: NOT_AN_OBJECT, invalid_type_error: NOT_AN_OBJECT };

export const claimSchema = z.object({ reviewerId, expectedVersion }, objectErrors);
export const completionSchema = z.object({ reviewerId, expectedVersion, reviewNote }, objectErrors);

export const studyFilterSchema = z.object({
  status: z
    .enum(STUDY_STATUSES, {
      errorMap: () => ({ message: `status must be one of ${STUDY_STATUSES.join(', ')}` }),
    })
    .optional(),
  modality: z
    .string({ invalid_type_error: 'modality must be a single string value' })
    .regex(/^[A-Za-z0-9]{1,16}$/, 'modality must be 1-16 alphanumeric characters')
    .optional(),
  ownerId: z
    .string({ invalid_type_error: 'ownerId must be a single string value' })
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'ownerId must be 1-64 letters, digits, dashes or underscores')
    .optional(),
  search: z
    .string({ invalid_type_error: 'search must be a single string value' })
    .trim()
    .min(1, 'search must be 1-64 characters')
    .max(64, 'search must be 1-64 characters')
    .optional(),
  order: z
    .enum(SORT_ORDERS, { errorMap: () => ({ message: 'order must be asc or desc' }) })
    .optional(),
  // Query values arrive as strings, so the two paging numbers are coerced.
  page: z.coerce
    .number({ invalid_type_error: PAGE_MESSAGE })
    .int(PAGE_MESSAGE)
    .min(1, PAGE_MESSAGE)
    .default(1),
  pageSize: z.coerce
    .number({ invalid_type_error: PAGE_SIZE_MESSAGE })
    .int(PAGE_SIZE_MESSAGE)
    .min(1, PAGE_SIZE_MESSAGE)
    .max(MAX_LIST_RESULTS, PAGE_SIZE_MESSAGE)
    .default(MAX_LIST_RESULTS),
});

export type ClaimInput = z.infer<typeof claimSchema>;
export type CompletionInput = z.infer<typeof completionSchema>;

/** Parses untrusted input, turning the first problem into a safe, field-specific 400. */
export function parseInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  raw: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid input');
  }
  return result.data as z.infer<TSchema>;
}
