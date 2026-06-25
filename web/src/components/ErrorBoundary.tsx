import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="banner error">
            <strong>Something went wrong loading the dashboard.</strong>
            <p>{this.state.error.message}</p>
            <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
