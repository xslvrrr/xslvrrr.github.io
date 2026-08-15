# Bug reports and feature suggestions

Users file reports from the **Bugs/Suggestions** button under Search in the dashboard sidebar.
Administrators answer them from a shared queue that appears as a modal on the dashboard, and manage
the fallout from **Settings → Administrator**. Reporters read their own history and any replies from
**Settings → Reports**.

## What a report contains

The dialog asks a different second and third question depending on the first answer:

| First answer | Follow-ups |
|---|---|
| Bug report | Which part of the site; what kind of bug (performance, looks wrong, site crashes, doesn't work, other — with a short free-text follow-up); a long description including steps to reproduce |
| Feature suggestion | What type (new page, addition to an existing page, new concept, addition to settings); a long description of the behaviour wanted |

The send button stays disabled until every visible question is answered, and its label follows the
chosen kind ("Send bug report" / "Send suggestion"). `buildFeedbackSubmission` in
`lib/feedback/options.ts` decides that, and the API validates with the same function — the button
cannot enable for a shape the server would reject.

## The administrator queue

One queue, shared by every administrator. `feedback_admin_queue` returns pending reports oldest
first plus the total pending count shown on the modal and on the settings page.

The dashboard polls every 30 seconds while the tab is visible. Whoever answers a report first
resolves it for everyone: `feedback_admin_resolve` only updates rows that are still `pending`, so a
second administrator acting on the same row is told it was already handled instead of overwriting
the decision.

Closing the modal snoozes that one report, not the queue, so a genuinely new report still opens it.

### Decisions and their follow-ups

Every decision can carry an optional reply the reporter will see.

- **Dismiss** → *Suspend from reports?* → if yes, a length and an optional reason.
- **Accept** → *Create GitHub issue?*

## What the reporter is told

`FeedbackProvider` re-reads the reporter's overview every 60 seconds and raises one toast per
outcome:

| Outcome | Toast |
|---|---|
| Report accepted | Green |
| Report dismissed | Red |
| Account suspended | Red |
| Appeal accepted | Green |
| Appeal declined | Red |

When the administrator wrote a reply, the toast carries a **View message** button; the same reply is
reachable later from the report history. Each outcome is announced once — the server records that it
was shown, and a local set stops a repeat between that write and the next poll. If the write fails,
the outcome is announced again in a later session, which is the safe direction for it to fail.

## Suspensions

A suspended account opens a notice instead of the report form. It states the suspension, its length
and reason, and offers **I understand** and **Appeal**.

Lengths are typed as shorthand, parsed by `lib/feedback/duration.ts`:

| Suffix | Unit |
|---|---|
| `h` | hours |
| `d` | days |
| `w` | weeks |
| `m` | months |
| `y` | years |
| `perm` | permanent (stored as a null expiry) |

Segments combine — `1y 6m`, `3d12h`. Months and years are calendar arithmetic, not fixed
millisecond counts, so `1m` typed on the 31st lands on a real date. Anything else is refused with a
message rather than silently reinterpreted.

### Appeals

One appeal per suspension, enforced in the database rather than in the browser. Extending an active
suspension keeps the same row and does not hand back a second attempt; a suspension issued after a
revocation is a new row and does.

Administrators answer appeals under **Settings → Administrator → Suspension appeals**, with an
optional reply. Accepting an appeal expires the suspension immediately rather than deleting it, so
the history stays readable to both sides and a repeat suspension is still visible as a repeat.

## GitHub

Authentication is a single server-side token, so no browser ever holds a credential and there is
nothing for an administrator to sign in to.

| Variable | Required | Default |
|---|---|---|
| `GITHUB_ISSUES_TOKEN` | Yes | — |
| `GITHUB_ISSUES_REPOSITORY` | No | `xslvrrr/xslvrrr.github.io` |

The token needs issue read and write access on the target repository.

Accepted reports can be filed as issues, carrying the report's answers and its internal reference —
never the reporter's identity, because issues are public and the queue already shows who filed it.
If the repository has deleted the default labels, the issue is filed without labels rather than
failing.

**Settings → Administrator → GitHub issues** lists the repository's issues (open, closed, or all) so
administrators can read them without leaving the site. Only the summarised list reaches the browser.

## Limits

- Submission: 5 reports per account per hour.
- Overview reads: 180 per account per hour, sized for the 60-second poll.
- Appeal actions: 20 per account per hour.
- Administrator queue reads: 240 per hour, sized for the 30-second poll.
- GitHub issue list reads: 120 per administrator per hour.
- Free text: 200 characters for the area, 120 for the "other" category, 20–4000 for the description,
  1000 for an administrator reply, 300 for a suspension reason, 20–1500 for an appeal.

## Schema

- `202608150001_feedback_reports.sql` adds `public.feedback_reports` and
  `public.feedback_suspensions`.
- `202608150002_feedback_responses.sql` adds administrator replies, appeal state, and the "seen"
  marks behind the toasts.

Both tables are service-role only. Every function is `security definer` and re-checks `users.role`
from current database state; session cookies carry no authority. Accept, dismiss, suspend, extend,
revoke, and both appeal outcomes are recorded in `public.admin_audit_log`.
