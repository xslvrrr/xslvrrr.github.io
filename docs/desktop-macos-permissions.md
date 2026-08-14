# Installing Millennium Desktop on macOS and granting browser access

Millennium Desktop is **ad-hoc signed** rather than notarized by Apple. The app is identical to a
notarized build; the difference is that macOS has no Apple-issued ticket vouching for it, so it
treats the download as untrusted until you approve it once.

This guide covers the two approvals macOS asks for, and what to do when it asks for neither.

---

## 1. Install into Applications

This step is not cosmetic. macOS runs an unapproved downloaded app from a randomized, temporary
read-only location (App Translocation). Permissions granted to a copy running from there are
forgotten on the next launch, because the path is different every time.

1. Open the downloaded `.dmg`.
2. Drag **Millennium** into the **Applications** folder.
3. Eject the disk image and open **Applications**.

## 2. Open it the first time

macOS blocks the first launch of a non-notarized app.

1. Right-click (or Control-click) **Millennium** in Applications and choose **Open**.
2. Confirm at the warning.

If that is refused:

1. Open  → **System Settings** → **Privacy & Security**.
2. Scroll to the security message naming Millennium.
3. Choose **Open Anyway**, then confirm.

After this launch, Millennium removes its own download quarantine flag, so later launches behave
normally and macOS can remember permissions.

## 3. Allow read-only browser access

Google Classroom sync reads pages from a dedicated browser window that Millennium opens. macOS
gates that behind the **Automation** privacy permission.

1. In Millennium, open **Classroom** and start a sync.
2. Wait for the dedicated browser window to open — macOS can only ask about a browser that is
   already running.
3. Choose **Allow** when macOS asks whether Millennium can control Google Chrome (or Chromium, or
   Microsoft Edge).

Sync continues automatically once access is granted.

---

## When no prompt appears

**System Settings → Privacy & Security → Automation has no button for adding an app.** Apple builds
that pane to be read-only: an application row appears there *only after* the application has
successfully asked at least once. An empty list therefore does not mean you missed a control — it
means the request never reached macOS.

Millennium's permission dialog reports why. The usual causes:

| What the dialog reports | What it means | What to do |
| --- | --- | --- |
| The downloaded copy is still quarantined | macOS is blocking the request because the download is untrusted | Choose **Repair permission**, then **Ask macOS again** |
| macOS is running Millennium from a temporary copy | The app was opened from Downloads or a disk image | Quit Millennium, drag it into **Applications**, and open it from there |
| The browser is not running yet | macOS has nothing to ask about | Start Classroom sync first, then grant access |
| Browser access was declined | macOS stored the refusal and will not ask again | Choose **Repair permission**, then **Ask macOS again** |
| The application signature is damaged | The bundle was modified or copied incorrectly | Reinstall from a fresh download |
| This is an unpackaged development build | You are running `bun run desktop:dev` | Use the installed application |

**Repair permission** clears Millennium's own download quarantine flag and resets its stored
automation decision, which is the only supported way to make macOS present the prompt again after a
refusal. It touches nothing but Millennium.

### Manual equivalents

If you prefer to do it from Terminal:

```bash
# Clear the download quarantine flag from Millennium only
xattr -dr com.apple.quarantine /Applications/Millennium.app

# Make macOS ask about browser automation again
tccutil reset AppleEvents education.millennium.desktop
```

Then reopen Millennium and start Classroom sync.

---

## After an update

Ad-hoc signatures carry no Apple Team ID, so macOS identifies Millennium by a hash of its contents.
That hash changes with every release, which means **an update clears the browser automation
grant**. macOS will ask again on the next sync — approve it as in step 3. No reinstall is needed.

## What Millennium can and cannot do with this access

The Automation permission lets Millennium read pages that are already visible in the dedicated
browser window it opened. It reads course names, classwork, materials, due dates, grades, and
submission status. It cannot create, edit, submit, or delete Classroom content, and it never sees
your Google password — sign-in happens directly in that browser window.
