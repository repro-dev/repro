import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promise } from "fluture";
import { createConsoleProvider } from "./console";

describe("console provider", () => {
  it("resolves without error for a valid email message", async () => {
    const provider = createConsoleProvider();

    await promise(
      provider.send({
        to: "test@example.com",
        from: "noreply@example.com",
        subject: "Test Subject",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
    );

    assert.ok(true);
  });

  it("resolves without error when text is omitted", async () => {
    const provider = createConsoleProvider();

    await promise(
      provider.send({
        to: "test@example.com",
        from: "noreply@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
      }),
    );

    assert.ok(true);
  });
});
