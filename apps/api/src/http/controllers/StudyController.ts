import type { Request, Response } from 'express';
import type { StudyService } from '../../services/StudyService';
import type { ReviewerDirectory } from '../../domain/ports';

/** Sends a file and surfaces a failure (for example a missing fixture) as an error. */
function sendFile(res: Response, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    res.sendFile(filePath, (error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Translates HTTP to service calls. Request bodies and query values are passed
 * through as `unknown`; the service owns validation so the rules live in one place.
 */
export class StudyController {
  constructor(
    private readonly studies: StudyService,
    private readonly reviewers: ReviewerDirectory,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { status, modality } = req.query;
    res.json(await this.studies.listStudies({ status, modality }));
  };

  get = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    res.json(await this.studies.getStudy(req.params.id));
  };

  file = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const filePath = await this.studies.resolveFile(req.params.id);
    res.type('application/dicom');
    res.setHeader('Cache-Control', 'private, no-store');
    await sendFile(res, filePath);
  };

  claim = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    res.json(await this.studies.claim(req.params.id, req.body as unknown));
  };

  complete = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    res.json(await this.studies.complete(req.params.id, req.body as unknown));
  };

  listReviewers = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.reviewers.list());
  };
}
