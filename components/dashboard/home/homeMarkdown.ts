export type NoteTokenValues = Record<string, string>

export function buildNoteTokenValues({
  lastUpdated,
  now = new Date(),
  formatDate,
}: {
  lastUpdated?: string
  now?: Date
  formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string
}): NoteTokenValues {
  return {
    "{{lastUpdated}}": lastUpdated ? new Date(lastUpdated).toLocaleString() : "Not synced yet",
    "{{today}}": formatDate(now, { day: "numeric", month: "short", year: "numeric" }),
    "{{time}}": now.toLocaleTimeString(),
    "{{now}}": now.toLocaleString(),
  }
}

export function applyNoteTokens(text: string, tokenValues: NoteTokenValues) {
  let output = text
  Object.entries(tokenValues).forEach(([token, value]) => {
    output = output.split(token).join(value)
  })
  return output
}

export function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function sanitizeMarkdownLink(url: string) {
  const trimmed = url.trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return trimmed
  }
  return "#"
}

export function parseInlineMarkdown(input: string) {
  let output = input
  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeUrl = sanitizeMarkdownLink(url)
    return safeUrl === "#"
      ? ""
      : `<img src="${safeUrl}" alt="${label}" loading="lazy" />`
  })
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeUrl = sanitizeMarkdownLink(url)
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>")
  output = output.replace(/~~([^~]+)~~/g, "<del>$1</del>")
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>")
  return output
}

function highlightCode(input: string) {
  return input
    .replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="mdTokenString">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|class|interface|type|import|export|from|async|await|try|catch|new|extends|true|false|null|undefined)\b/g, '<span class="mdTokenKeyword">$1</span>')
    .replace(/\b([A-Z][A-Za-z0-9_]*)(?=\s*[<={])/g, '<span class="mdTokenType">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="mdTokenNumber">$1</span>')
    .replace(/(\/\/.*)$/gm, '<span class="mdTokenComment">$1</span>')
}

function parseTableRow(line: string) {
  const trimmed = line.trim()
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "")
  return withoutEdges.split("|").map((cell) => cell.trim())
}

function isTableSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

export function markdownToHtml(input: string) {
  const escaped = escapeHtml(input)
  const lines = escaped.split("\n")
  let html = ""
  let inUl = false
  let inOl = false
  let index = 0

  const closeLists = () => {
    if (inUl) {
      html += "</ul>"
      inUl = false
    }
    if (inOl) {
      html += "</ol>"
      inOl = false
    }
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    const unorderedMatch = /^[-*]\s+(.+)$/.exec(trimmed)
    const orderedMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed)
    const taskMatch = /^[-*]\s+\[( |x)\]\s+(.+)$/i.exec(trimmed)

    if (trimmed.startsWith("```")) {
      closeLists()
      const language = trimmed.replace(/^```/, "").trim().replace(/[^a-z0-9_+-]/gi, "")
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      html += `<pre class="mdCodeBlock" data-language="${language || "text"}"><code>${highlightCode(codeLines.join("\n"))}</code></pre>`
      continue
    }

    if (taskMatch) {
      if (!inUl) {
        closeLists()
        html += "<ul>"
        inUl = true
      }
      html += `<li class="mdTaskItem"><input type="checkbox" disabled ${taskMatch[1].toLowerCase() === "x" ? "checked" : ""} /> ${parseInlineMarkdown(taskMatch[2])}</li>`
      index += 1
      continue
    }

    if (unorderedMatch) {
      if (!inUl) {
        closeLists()
        html += "<ul>"
        inUl = true
      }
      html += `<li>${parseInlineMarkdown(unorderedMatch[1])}</li>`
      index += 1
      continue
    }

    if (orderedMatch) {
      if (!inOl) {
        closeLists()
        html += "<ol>"
        inOl = true
      }
      html += `<li>${parseInlineMarkdown(orderedMatch[2])}</li>`
      index += 1
      continue
    }

    closeLists()

    if (trimmed.startsWith("&gt; ")) {
      html += `<blockquote>${parseInlineMarkdown(trimmed.replace(/^&gt;\s+/, ""))}</blockquote>`
      index += 1
      continue
    }

    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1])
    ) {
      const headers = parseTableRow(trimmed)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim().includes("|") && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]))
        index += 1
      }
      html += "<table><thead><tr>"
      html += headers.map((cell) => `<th>${parseInlineMarkdown(cell)}</th>`).join("")
      html += "</tr></thead>"
      if (rows.length) {
        html += "<tbody>"
        html += rows.map((row) => (
          `<tr>${headers.map((_header, cellIndex) => `<td>${parseInlineMarkdown(row[cellIndex] || "")}</td>`).join("")}</tr>`
        )).join("")
        html += "</tbody>"
      }
      html += "</table>"
      continue
    }

    if (!trimmed) {
      html += "<br />"
      index += 1
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html += "<hr />"
      index += 1
      continue
    }

    if (trimmed.startsWith("###### ")) {
      html += `<h6>${parseInlineMarkdown(trimmed.replace(/^######\s+/, ""))}</h6>`
      index += 1
      continue
    }
    if (trimmed.startsWith("##### ")) {
      html += `<h5>${parseInlineMarkdown(trimmed.replace(/^#####\s+/, ""))}</h5>`
      index += 1
      continue
    }
    if (trimmed.startsWith("#### ")) {
      html += `<h4>${parseInlineMarkdown(trimmed.replace(/^####\s+/, ""))}</h4>`
      index += 1
      continue
    }
    if (trimmed.startsWith("### ")) {
      html += `<h3>${parseInlineMarkdown(trimmed.replace(/^###\s+/, ""))}</h3>`
      index += 1
      continue
    }
    if (trimmed.startsWith("## ")) {
      html += `<h2>${parseInlineMarkdown(trimmed.replace(/^##\s+/, ""))}</h2>`
      index += 1
      continue
    }
    if (trimmed.startsWith("# ")) {
      html += `<h1>${parseInlineMarkdown(trimmed.replace(/^#\s+/, ""))}</h1>`
      index += 1
      continue
    }

    html += `<p>${parseInlineMarkdown(trimmed)}</p>`
    index += 1
  }

  closeLists()
  return html
}
