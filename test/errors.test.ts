import { describe, expect, it } from "vitest";
import {
  AuthError,
  exitCodeFor,
  ParseError,
  SyncError,
  TransientError,
  UpstreamError,
} from "../src/errors";

describe("errors", () => {
  it("errors: exit codes", () => {
    expect(exitCodeFor(new AuthError("x"))).toBe(78);
    expect(exitCodeFor(new ParseError("x"))).toBe(65);
    expect(exitCodeFor(new UpstreamError("x"))).toBe(69);
    expect(exitCodeFor(new TransientError("x"))).toBe(75);
    expect(exitCodeFor(new SyncError("x"))).toBe(70);
    expect(exitCodeFor(new TypeError("x"))).toBe(70);
    expect(exitCodeFor("non un errore")).toBe(70);
  });
});
