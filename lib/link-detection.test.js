import test from "node:test"
import assert from "node:assert/strict"

import { getGmailComposeUrl, rewriteMailtoHref, splitDetectedLinks } from "./link-detection.ts"

test("detected emails and mailto links use Gmail compose", () => {
  assert.equal(
    rewriteMailtoHref("mailto:person@example.com"),
    getGmailComposeUrl("person@example.com"),
  )

  const parts = splitDetectedLinks("Email person@example.com, then visit www.example.com.")
  assert.deepEqual(parts, [
    { text: "Email " },
    { text: "person@example.com", href: getGmailComposeUrl("person@example.com") },
    { text: ", then visit " },
    { text: "www.example.com", href: "https://www.example.com" },
    { text: "." },
  ])
})
