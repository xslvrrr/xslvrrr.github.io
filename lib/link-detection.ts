const linkTokenRegex = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const trailingPunctuationRegex = /[.,!?;:)\]]+$/;

export type DetectedTextPart = {
    text: string;
    href?: string;
};

export function getGmailComposeUrl(email: string): string {
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
}

export function rewriteMailtoHref(href: string): string {
    const trimmed = href.trim();
    if (!trimmed.toLowerCase().startsWith('mailto:')) return href;

    const email = trimmed.slice('mailto:'.length).split('?')[0];
    return emailRegex.test(email) ? getGmailComposeUrl(email) : href;
}

function getDetectedHref(token: string): string | undefined {
    if (emailRegex.test(token)) return getGmailComposeUrl(token);
    if (/^https?:\/\//i.test(token)) return token;
    if (/^www\./i.test(token)) return `https://${token}`;
    return undefined;
}

export function splitDetectedLinks(text: string): DetectedTextPart[] {
    const parts: DetectedTextPart[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(linkTokenRegex)) {
        const rawToken = match[0];
        const index = match.index ?? 0;
        if (index > lastIndex) {
            parts.push({ text: text.slice(lastIndex, index) });
        }

        const suffix = rawToken.match(trailingPunctuationRegex)?.[0] || '';
        const token = suffix ? rawToken.slice(0, -suffix.length) : rawToken;
        const href = getDetectedHref(token);

        parts.push(href ? { text: token, href } : { text: rawToken });
        if (suffix) parts.push({ text: suffix });
        lastIndex = index + rawToken.length;
    }

    if (lastIndex < text.length) {
        parts.push({ text: text.slice(lastIndex) });
    }

    return parts.length ? parts : [{ text }];
}
