import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** Shown instead of the children after a render error. */
  fallback: (retry: () => void) => ReactNode;
  /** When this value changes, the boundary clears its error and tries again. */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Contains a render-time failure to one part of the page. Used around the
 * viewer so that a bug there can never take the worklist down with it.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  private readonly retry = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children;
  }
}
