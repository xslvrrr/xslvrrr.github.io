export type StudyErrorCode =
  | "STUDY_NOT_FOUND"
  | "STUDY_CONFLICT"
  | "STUDY_LIMIT_REACHED"
  | "STUDY_INVALID_INPUT"
  | "STUDY_CLIENT_UPGRADE_REQUIRED"
  | "STUDY_OPERATION_REJECTED";

export class StudyServiceError extends Error {
  readonly code: StudyErrorCode;
  readonly status: number;

  constructor(code: StudyErrorCode, message: string, status: number) {
    super(message);
    this.name = "StudyServiceError";
    this.code = code;
    this.status = status;
  }
}
