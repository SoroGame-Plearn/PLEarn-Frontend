"use client";

import { Component, type ReactNode } from "react";
import ApiErrorDisplay from "./ApiErrorDisplay";

interface Props {
  children: ReactNode;
}

interface State {
  error: unknown;
}

/**
 * Reusable client-side error boundary for subtrees that fetch data
 * outside of a route's own error.tsx (e.g. inside a modal or a component
 * that isn't itself a route segment). Route segments should prefer a
 * colocated error.tsx, which Next.js wires up automatically.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ApiErrorDisplay error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}
