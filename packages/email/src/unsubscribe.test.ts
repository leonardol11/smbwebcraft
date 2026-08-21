import { describe, expect, it } from "vitest";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";

const SECRET = "test-secret-at-least-16";

describe("unsubscribe tokens", () => {
  it("round-trips email through HMAC token", () => {
    const token = createUnsubscribeToken("Owner@Biz.com", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe("owner@biz.com");
  });

  it("rejects tampered tokens", () => {
    const token = createUnsubscribeToken("a@b.com", SECRET);
    expect(verifyUnsubscribeToken(`${token}x`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(token, "wrong-secret-here!!")).toBeNull();
  });
});
