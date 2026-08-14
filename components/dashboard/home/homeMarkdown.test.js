import test from "node:test"
import assert from "node:assert/strict"

import {
  applyNoteTokens,
  buildNoteTokenValues,
  escapeHtml,
  markdownToHtml,
  sanitizeMarkdownLink,
} from "./homeMarkdown.ts"

test("escapeHtml escapes unsafe note content", () => {
  assert.equal(escapeHtml("<script>\"x\" & 'y'</script>"), "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;")
})

test("sanitizeMarkdownLink allows http, https, and mailto only", () => {
  assert.equal(sanitizeMarkdownLink("https://example.com"), "https://example.com")
  assert.equal(sanitizeMarkdownLink("mailto:test@example.com"), "mailto:test@example.com")
  assert.equal(sanitizeMarkdownLink("javascript:alert(1)"), "#")
})

test("markdownToHtml renders headings, emphasis, code, links, and lists", () => {
  const html = markdownToHtml("# Title\n- **Bold** item\n1. `Code`\n[Site](https://example.com)")
  assert.match(html, /<h1>Title<\/h1>/)
  assert.match(html, /<ul><li><strong>Bold<\/strong> item<\/li><\/ul>/)
  assert.match(html, /<ol><li><code>Code<\/code><\/li><\/ol>/)
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">Site<\/a>/)
})

test("markdownToHtml renders horizontal separators", () => {
  assert.equal(markdownToHtml("Before\n---\nAfter"), "<p>Before</p><hr /><p>After</p>")
})

test("markdownToHtml renders tables and subheadings", () => {
  const html = markdownToHtml("#### Details\n| Name | Status |\n| --- | --- |\n| **Math** | `Ready` |")
  assert.match(html, /<h4>Details<\/h4>/)
  assert.match(html, /<table><thead><tr><th>Name<\/th><th>Status<\/th><\/tr><\/thead>/)
  assert.match(html, /<tbody><tr><td><strong>Math<\/strong><\/td><td><code>Ready<\/code><\/td><\/tr><\/tbody><\/table>/)
})

test("markdownToHtml blocks unsafe markdown links after escaping labels", () => {
  const html = markdownToHtml("[<bad>](javascript:alert)")
  assert.equal(html, '<p><a href="#" target="_blank" rel="noopener noreferrer">&lt;bad&gt;</a></p>')
})

test("applyNoteTokens replaces all token instances", () => {
  assert.equal(applyNoteTokens("{{today}} and {{today}}", { "{{today}}": "9 Jun" }), "9 Jun and 9 Jun")
})

test("buildNoteTokenValues returns stable fallback labels", () => {
  const values = buildNoteTokenValues({
    now: new Date("2026-06-09T10:00:00.000Z"),
    formatDate: () => "9 Jun 2026",
  })
  assert.equal(values["{{lastUpdated}}"], "Not synced yet")
  assert.equal(values["{{today}}"], "9 Jun 2026")
})
