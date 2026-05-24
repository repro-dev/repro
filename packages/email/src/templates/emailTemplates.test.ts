import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailVerificationEmail } from "./emailVerification";
import { invitationEmail } from "./invitation";
import { passwordResetEmail } from "./passwordReset";

describe("email templates", () => {
  it("escapes verification template html fields", () => {
    const message = emailVerificationEmail({
      verificationUrl:
        "https://example.test/account/verify?verificationToken=a&email=<tag>",
      userName: 'Alice <Admin> & "QA"',
    });

    assert.ok(
      message.html.includes("Alice &lt;Admin&gt; &amp; &quot;QA&quot;"),
    );
    assert.ok(
      message.html.includes(
        "https://example.test/account/verify?verificationToken=a&amp;email=&lt;tag&gt;",
      ),
    );
    assert.ok(message.text?.includes('Alice <Admin> & "QA"'));
  });

  it("escapes password reset template html fields", () => {
    const message = passwordResetEmail({
      resetUrl: "https://example.test/reset?token=a&next=<tag>",
      userName: 'Alice <Admin> & "QA"',
    });

    assert.ok(
      message.html.includes("Alice &lt;Admin&gt; &amp; &quot;QA&quot;"),
    );
    assert.ok(
      message.html.includes(
        "https://example.test/reset?token=a&amp;next=&lt;tag&gt;",
      ),
    );
    assert.ok(message.text?.includes('Alice <Admin> & "QA"'));
  });

  it("escapes invitation template html fields", () => {
    const message = invitationEmail({
      invitationUrl:
        "https://example.test/account/accept-invitation?invitationToken=a&email=<tag>",
      workspaceName: "Acme <Core> & Co.",
      inviterName: 'Jane <Team> & "QA"',
    });

    assert.ok(message.html.includes("Acme &lt;Core&gt; &amp; Co."));
    assert.ok(message.html.includes("Jane &lt;Team&gt; &amp; &quot;QA&quot;"));
    assert.ok(
      message.html.includes(
        "https://example.test/account/accept-invitation?invitationToken=a&amp;email=&lt;tag&gt;",
      ),
    );
    assert.ok(message.text?.includes("Acme <Core> & Co."));
  });
});
