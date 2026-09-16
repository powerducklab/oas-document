import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  ChakraProvider,
  defaultSystem,
  useChakraContext,
} from "@chakra-ui/react";

type OptionalChakraProviderProps = {
  children: ReactNode;
  theme?: Parameters<typeof ChakraProvider>[0]["value"];
};

/**
 * Calls useChakraContext to detect an ancestor ChakraProvider.
 * Throws when none exists (strict mode).
 */
function ChakraContextDetector({ children }: { children: ReactNode }) {
  useChakraContext();
  return <>{children}</>;
}

type ErrorBoundaryState = { hasError: boolean };

/**
 * Catches the strict-context error from ChakraContextDetector and renders
 * children wrapped in a self-provided ChakraProvider as fallback.
 */
class ChakraErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Silently catch — we intentionally fall back to our own provider.
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

/**
 * Wraps children in a ChakraProvider only when no ancestor ChakraProvider
 * exists. Detected via useChakraContext throwing in strict mode.
 */
export function OptionalChakraProvider({
  children,
  theme,
}: OptionalChakraProviderProps) {
  return (
    <ChakraErrorBoundary
      fallback={
        <ChakraProvider value={theme ?? defaultSystem}>
          {children}
        </ChakraProvider>
      }
    >
      <ChakraContextDetector>{children}</ChakraContextDetector>
    </ChakraErrorBoundary>
  );
}
