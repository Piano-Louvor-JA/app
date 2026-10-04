import { vi } from "vitest";

export const RemoteControlReceiver = vi.fn(
  class {
    start = vi.fn();
    stop = vi.fn();
    connected = false;
    constructor(
      public url: string,
      public opts: Record<string, unknown>,
    ) {
      console.log("Mocked RemoteControlReceiver created for:", url);
    }
  }
);