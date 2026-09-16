import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";

type OptionalChakraProviderProps = {
  children: ReactNode;
};

/**
 * Always wraps children in a ChakraProvider using the default system.
 *
 * Chakra v3 supports nested providers: an outer provider (from the host app)
 * and this inner one coexist safely. Detecting an ancestor provider via
 * `useChakraContext()` + an error boundary caused an unmount/remount cycle in
 * React 19, which disposed the shared Shiki highlighter. Wrapping unconditionally
 * avoids that cycle entirely.
 */
export function OptionalChakraProvider({ children }: OptionalChakraProviderProps) {
  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}
