const KEY = 'imaging.reviewerId';

/** Storage can be blocked (private mode, policy); the app must work without it. */
export function loadReviewerPreference(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveReviewerPreference(reviewerId: string): void {
  try {
    window.sessionStorage.setItem(KEY, reviewerId);
  } catch {
    // Ignore: the preference is a convenience only.
  }
}
