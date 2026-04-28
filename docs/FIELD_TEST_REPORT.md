# Parrish HALO Field Stress Test Report

> **Purpose:** Validate that all Phase 1–4 features hold up under realistic clinical
> network and device conditions before declaring Phase 4 complete. This template
> is the artifact a human tester fills in while running the protocol below.

**Date:** _____________________
**Tester:** _____________________
**Browser + version:** _____________________
**Build / commit hash:** _____________________

---

## Network Profiles

Use Chrome DevTools → **Network** → Throttling → **Add custom profile** and enter the
values below. For offline testing, toggle the **Offline** checkbox.

| Profile          | Down (Mbps) | Up (Mbps) | Latency (ms) | Represents                          |
| ---------------- | ----------- | --------- | ------------ | ----------------------------------- |
| Clinical WiFi    | 5           | 2         | 80           | Typical facility shared WiFi        |
| Poor WiFi        | 1.5         | 0.5       | 200          | Congested facility network          |
| Mobile LTE       | 10          | 5         | 50           | Nurse on phone between floors       |
| Offline → Online | 0 → 5       | 0 → 2     | —            | WiFi dropout and reconnect          |

## Viewports

| Device           | Width  | Height | Test method                          |
| ---------------- | ------ | ------ | ------------------------------------ |
| iPad (landscape) | 1024px | 768px  | DevTools responsive mode             |
| iPad (portrait)  | 768px  | 1024px | DevTools responsive mode             |
| iPhone 14        | 390px  | 844px  | DevTools responsive mode             |
| Desktop (small)  | 1280px | 720px  | Browser window resize                |
| Desktop (large)  | 1920px | 1080px | Full screen                          |

---

## Scenarios

### Scenario 1 — Student training flow

1. Login as a staff user.
2. Browse the Course Catalog.
3. Enroll in a course.
4. Open the Course Player and navigate through 3 modules.
5. Complete a quiz (multiple choice + short answer).
6. View the resulting grade on the Dashboard.
7. Download the certificate from My Grades.

**Pass criteria:** No errors. No step takes longer than 10s on Clinical WiFi or 20s on
Poor WiFi. Auto-save preserves answers. The cert email arrives at the staff address
(check inbox after step 7).

### Scenario 2 — Instructor grading flow

1. Login as an instructor.
2. Open Grade Center.
3. Open a submission, read answers.
4. Approve with score override.
5. Open a second submission, reject with reason.
6. Open Course Roster and confirm the grade updates.

**Pass criteria:** All steps complete. Review modal loads within 5s. Toast feedback
appears on every action.

### Scenario 3 — Admin reporting flow

1. Login as admin.
2. Open Skill-Gap Dashboard. All sections render.
3. Filter by department.
4. Navigate to Reports.
5. Generate Staff Training Completion (PDF + CSV).
6. Generate Policy Signature Audit (PDF + CSV).
7. Navigate to Policies. View signature status for one policy.

**Pass criteria:** Skill-Gap Dashboard loads within 5s on Clinical WiFi. Each report
generates within 10s. PDFs render with brand header, table, and page-numbered footer.

### Scenario 4 — Policy signing flow

1. Login as staff.
2. Open Policy Center.
3. Select an unsigned policy.
4. Confirm the signature area is gated until scroll-to-bottom or the 30-second timer.
5. Draw a signature with the canvas tool.
6. Tick the acknowledgment checkbox.
7. Sign the policy.
8. Confirm the signature now shows in Policy Center as Signed.
9. As admin, confirm the signature appears in Policies and the Policy Signature
   Audit report.

**Pass criteria:** Signature gate behaves as specified. Signature is recorded with
non-empty `documentHash`, `userAgent`, and (where reachable) `ipAddress` fields in
Firestore. Audit log entry `POLICY_SIGNED` exists.

### Scenario 5 — Offline resilience

1. Start a quiz.
2. Answer 3 questions.
3. Toggle network to Offline.
4. Answer 2 more questions.
5. Observe: auto-save fails gracefully (no crash, no error modal).
6. Toggle network back to Online.
7. Observe: auto-save resumes and persists draft answers.
8. Submit the quiz.

**Pass criteria:** No data loss. No unhandled errors. Auto-save resumes on reconnect.
Quiz submission succeeds.

---

## Results Matrix — Network Profiles

Replace each cell with `PASS` or `FAIL (note)` and approximate page-load time in seconds.

| Scenario                | Clinical WiFi | Poor WiFi | Mobile LTE | Offline → Online |
| ----------------------- | ------------- | --------- | ---------- | ---------------- |
| Student flow            |               |           |            |                  |
| Instructor flow         |               |           |            |                  |
| Admin reporting flow    |               |           |            |                  |
| Policy signing flow     |               |           |            |                  |
| Offline resilience      | N/A           | N/A       | N/A        |                  |

## Results Matrix — Viewports

| Scenario                | iPad landscape | iPad portrait | iPhone 14 | Desktop small | Desktop large |
| ----------------------- | -------------- | ------------- | --------- | ------------- | ------------- |
| Student flow            |                |               |           |               |               |
| Instructor flow         |                |               |           |               |               |
| Admin reporting flow    |                |               |           |               |               |
| Policy signing flow     |                |               |           |               |               |

---

## Issues Found

For each issue, capture: short description, severity (HIGH/MEDIUM/LOW), affected page,
network profile, and root cause if known.

| #   | Description | Severity | Page | Profile | Root cause / fix |
| --- | ----------- | -------- | ---- | ------- | ---------------- |
| 1   |             |          |      |         |                  |
| 2   |             |          |      |         |                  |

**Severity definitions:**

- **HIGH** — blocks usage, data loss, or audit-critical failure. Must fix before Phase 4 close.
- **MEDIUM** — degraded but usable. Track as follow-up.
- **LOW** — cosmetic. Track as follow-up.

---

## Performance Notes

- Slowest page load: ____________ (page) at ______ ms on ____________ profile
- Largest payload: ____________ (page) at ______ KB
- Other observations:

---

## Sign-off

- [ ] All HIGH-severity issues fixed and re-tested
- [ ] MEDIUM/LOW issues documented as follow-up tasks
- [ ] No scenario crashes or loses data on any profile
- [ ] Auto-save resilience confirmed on offline → online transition

**Tester signature:** _____________________  **Date:** _____________________
