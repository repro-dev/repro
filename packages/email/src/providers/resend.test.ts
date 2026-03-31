import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promise } from "fluture";
import { CreateEmailOptions } from "resend";
import { createResendProvider } from "./resend";

describe("resend provider", () => {
  it("calls resend SDK with correct payload", async (t) => {
    const mockSend = t.mock.fn<
      (opts: CreateEmailOptions) => Promise<{
        data: { id: string } | null;
        error: null | { message: string; name: string };
      }>
    >(async () => ({
      data: { id: "test-id" },
      error: null,
    }));

    const mockResendClient = {
      emails: {
        send: mockSend,
      },
    };

    await promise(
      createResendProvider(mockResendClient as never).send({
        to: "recipient@example.com",
        from: "sender@example.com",
        subject: "Hello World",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
    );

    assert.equal(mockSend.mock.calls.length, 1);
    const call = mockSend.mock.calls[0];
    assert.ok(call != null);
    assert.deepEqual(call.arguments[0], {
      to: "recipient@example.com",
      from: "sender@example.com",
      subject: "Hello World",
      html: "<p>Hello</p>",
      text: "Hello",
    });
  });

  it("calls resend SDK without text when omitted", async (t) => {
    const mockSend = t.mock.fn<
      (opts: CreateEmailOptions) => Promise<{
        data: { id: string } | null;
        error: null | { message: string; name: string };
      }>
    >(async () => ({
      data: { id: "test-id" },
      error: null,
    }));

    const mockResendClient = {
      emails: {
        send: mockSend,
      },
    };

    await promise(
      createResendProvider(mockResendClient as never).send({
        to: "recipient@example.com",
        from: "sender@example.com",
        subject: "Hello",
        html: "<p>Hello</p>",
      }),
    );

    assert.equal(mockSend.mock.calls.length, 1);
    const call = mockSend.mock.calls[0];
    assert.ok(call != null);
    assert.equal(call.arguments[0]?.text, undefined);
  });

  it("rejects with error when resend returns an error", async (t) => {
    const mockSend = t.mock.fn<
      (opts: CreateEmailOptions) => Promise<{
        data: null;
        error: { message: string; name: string };
      }>
    >(async () => ({
      data: null,
      error: { message: "Invalid API key", name: "validation_error" },
    }));

    const mockResendClient = {
      emails: {
        send: mockSend,
      },
    };

    await assert.rejects(
      () =>
        promise(
          createResendProvider(mockResendClient as never).send({
            to: "recipient@example.com",
            from: "sender@example.com",
            subject: "Hello",
            html: "<p>Hello</p>",
          }),
        ),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid API key"));
        return true;
      },
    );
  });
});
