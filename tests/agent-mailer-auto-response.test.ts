// Verification script for RFC 3834 auto-response support in server/agentMailer.ts
// Run with: npx tsx tests/agent-mailer-auto-response.test.ts
import {
  __setAgentMailTransportForTesting,
  autoResponseDedupe,
  buildAutoResponseHeaders,
  sendAutoResponse,
  shouldAutoRespond,
  type AgentMailTransport,
  type SubjectMessageHeaders,
} from "../server/agentMailer";

let pass = 0;
let fail = 0;
const fails: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== AgentMailer RFC 3834 auto-response tests ===");

// shouldAutoRespond — happy path (service)
const normal: SubjectMessageHeaders = {
  messageId: "<abc@example.com>",
  subject: "Question about my book",
  from: "alice@example.com",
  returnPath: "alice@example.com",
  to: "support@accessibooks.app",
};
autoResponseDedupe.clear();
check(
  "service responder replies to a normal inbound",
  shouldAutoRespond({ subject: normal, recipient: "support@accessibooks.app", dedupeKey: "k1" }).ok === true,
);

// Auto-Submitted: auto-replied → never reply
check(
  "skips messages with Auto-Submitted: auto-replied",
  shouldAutoRespond({
    subject: { ...normal, autoSubmitted: "auto-replied" },
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
  }).reason === "auto-submitted",
);

// Null return-path
check(
  "skips messages with null return-path <>",
  shouldAutoRespond({
    subject: { ...normal, returnPath: "<>" },
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
  }).reason === "null-return-path",
);

// Owner-list / responder pattern
check(
  "skips owner-list senders",
  shouldAutoRespond({
    subject: { ...normal, from: "owner-listserv@example.com", returnPath: "owner-listserv@example.com" },
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
  }).reason === "responder-pattern",
);

check(
  "skips MAILER-DAEMON",
  shouldAutoRespond({
    subject: { ...normal, from: "MAILER-DAEMON@example.com", returnPath: "MAILER-DAEMON@example.com" },
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
  }).reason === "responder-pattern",
);

check(
  "skips foo-request senders",
  shouldAutoRespond({
    subject: { ...normal, from: "users-request@example.com", returnPath: "users-request@example.com" },
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
  }).reason === "responder-pattern",
);

// List headers
check(
  "skips mailing-list mail (List-Id)",
  shouldAutoRespond({
    subject: { ...normal, listId: "<users.example.com>" },
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
  }).reason === "list-mail",
);

check(
  "skips Precedence: bulk",
  shouldAutoRespond({
    subject: { ...normal, precedence: "bulk" },
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
  }).reason === "list-mail",
);

// Personal responder requires recipient in To/Cc/Bcc
check(
  "personal responder requires recipient in To/Cc/Bcc",
  shouldAutoRespond({
    subject: { ...normal, to: "someone-else@example.com" },
    recipient: "vacation@accessibooks.app",
    dedupeKey: "vacation",
    responderClass: "personal",
  }).reason === "recipient-not-addressed",
);

check(
  "personal responder OK when recipient appears in Cc",
  shouldAutoRespond({
    subject: { ...normal, to: "other@example.com", cc: '"Vacation" <vacation@accessibooks.app>' },
    recipient: "vacation@accessibooks.app",
    dedupeKey: "vacation",
    responderClass: "personal",
  }).ok === true,
);

// De-dupe within window
autoResponseDedupe.clear();
const T0 = 1_000_000_000_000;
const r1 = shouldAutoRespond({ subject: normal, recipient: "support@accessibooks.app", dedupeKey: "k1", now: T0 });
check("first call to a new sender is allowed", r1.ok === true);
// Manually record (since shouldAutoRespond is pure)
import("../server/agentMailer").then(async (m) => {
  m.recordAutoResponse("support@accessibooks.app", "alice@example.com", "k1", undefined, T0);
  const r2 = shouldAutoRespond({ subject: normal, recipient: "support@accessibooks.app", dedupeKey: "k1", now: T0 + 1000 });
  check("second call within window is deduped", r2.reason === "deduped");
  const r3 = shouldAutoRespond({
    subject: normal,
    recipient: "support@accessibooks.app",
    dedupeKey: "k1",
    now: T0 + 8 * 24 * 60 * 60 * 1000,
  });
  check("after window expires, allowed again", r3.ok === true);

  // buildAutoResponseHeaders
  const headers = buildAutoResponseHeaders(
    { messageId: "abc@example.com", references: "<old@example.com>", subject: "Hi" },
    "service",
  );
  check("Auto-Submitted header is auto-generated for service responders", headers["Auto-Submitted"] === "auto-generated");
  check("In-Reply-To gets angle brackets", headers["In-Reply-To"] === "<abc@example.com>");
  check(
    "References appends the new Message-ID",
    headers["References"] === "<old@example.com> <abc@example.com>",
  );
  const personalHeaders = buildAutoResponseHeaders({ messageId: "<x@y>" }, "personal");
  check("Auto-Submitted is auto-replied for personal responders", personalHeaders["Auto-Submitted"] === "auto-replied");
  check(
    "X-Auto-Response-Suppress: All set on outgoing replies",
    personalHeaders["X-Auto-Response-Suppress"] === "All",
  );
  check(
    "no non-standard Precedence: auto_reply header",
    personalHeaders["Precedence"] === undefined,
  );

  // sendAutoResponse end-to-end with a stub transport
  autoResponseDedupe.clear();
  const captured: Parameters<AgentMailTransport>[0][] = [];
  __setAgentMailTransportForTesting(async (p) => {
    captured.push(p);
    return true;
  });
  const sent = await sendAutoResponse({
    to: "alice@example.com",
    text: "We received your message and will get back to you within 1 business day.",
    inReplyTo: {
      messageId: "abc@example.com",
      subject: "Refund question",
      from: "alice@example.com",
      returnPath: "alice@example.com",
      to: "support@accessibooks.app",
    },
    dedupeKey: "support-receipt",
    recipient: "support@accessibooks.app",
  });
  check("sendAutoResponse returns sent:true on first call", sent.sent === true);
  check("transport captured one outgoing message", captured.length === 1);
  check("outgoing subject has Auto: prefix", captured[0]?.subject === "Auto: Refund question");
  check(
    "outgoing headers include Auto-Submitted: auto-generated",
    captured[0]?.headers?.["Auto-Submitted"] === "auto-generated",
  );
  check(
    "outgoing headers include In-Reply-To with angle brackets",
    captured[0]?.headers?.["In-Reply-To"] === "<abc@example.com>",
  );

  // Repeat send is suppressed by dedupe
  const sent2 = await sendAutoResponse({
    to: "alice@example.com",
    text: "duplicate",
    inReplyTo: {
      messageId: "def@example.com",
      subject: "Refund question 2",
      from: "alice@example.com",
      returnPath: "alice@example.com",
      to: "support@accessibooks.app",
    },
    dedupeKey: "support-receipt",
    recipient: "support@accessibooks.app",
  });
  check("repeat sendAutoResponse within window is suppressed", sent2.sent === false && sent2.skippedReason === "deduped");
  check("transport not called for the deduped attempt", captured.length === 1);

  // Custom windowMs is honored by recordAutoResponse
  autoResponseDedupe.clear();
  m.recordAutoResponse("a@b.com", "c@d.com", "k", 1000, T0);
  check("custom 1s windowMs blocks within window", m.autoResponseDedupe.has("a@b.com", "c@d.com", "k", T0 + 500) === true);
  check("custom 1s windowMs expires after window", m.autoResponseDedupe.has("a@b.com", "c@d.com", "k", T0 + 1500) === false);

  __setAgentMailTransportForTesting(null);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
});
