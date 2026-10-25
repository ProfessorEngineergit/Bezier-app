/**
 * An error boundary for one part of the app (e.g. Visualize, Drawings), so a render error there
 * does not blank the whole page. The failed part shows a short message and a retry; the error is
 * logged to the console, where the problem report (`report/`) collects it.
 */

import { Component, type ReactNode } from 'react';

interface Props {
  /** What this part is, for the message ("Visualize"). */
  name: string;
  children: ReactNode;
}

interface State {
  failure: Error | null;
  /** Bumped by "Try again" so the children remount instead of being repaired in place. */
  attempt: number;
}

export class Isolated extends Component<Props, State> {
  override state: State = { failure: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failure: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown): void {
    console.error(`${this.props.name} stopped working:`, error);
  }

  override render(): ReactNode {
    const { failure, attempt } = this.state;
    if (failure === null) {
      return (
        <div className="isolated" key={attempt} style={{ display: 'contents' }}>
          <ForcedFailure name={this.props.name} />
          {this.props.children}
        </div>
      );
    }
    return (
      <div className="mode-workspace isolated-failed" role="alert">
        <p className="mode-empty">
          <strong>{this.props.name} stopped working.</strong>
          <br />
          The rest of Bezier, and your model, are untouched.
        </p>
        <button
          className="isolated-failed__retry"
          onClick={() => this.setState({ failure: null, attempt: attempt + 1 })}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }
}

/**
 * Lets browser tests break a part deliberately (`window.__bezierBreak = 'Visualize'`). Development
 * builds only.
 */
function ForcedFailure({ name }: { name: string }): null {
  const dev = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
  if (dev && (window as { __bezierBreak?: string }).__bezierBreak === name) {
    throw new Error(`${name} was broken on purpose`);
  }
  return null;
}
