# Release History

This document tracks the live production deployments of the JSMF platform to map code versions to Google Cloud Run revisions.

## [v1.1.0] - Razorpay Native Integration & Booking Slots (Upcoming)
**Date:** 2026-10-03
**Git Commit ID:** [To be added]
**Cloud Run Revision:** [To be added]

### Changes
*   Enabled native Razorpay checkout flow (retired external payment page).
*   Added "Delayed PDF Delivery" feature (release PDFs after a session ends).
*   Added "To Be Announced" (TBA) support for undated live sessions.
*   Fixed webhook temporary failure drops and duplicate email bugs.
*   Upgraded production logging to structured JSON format.

---

## [v1.0.0] - Initial Launch
**Date:** [Previous]
**Git Commit ID:** 17d734b72c36c9a6dcc2480a872b873562bdfb7b
**Cloud Run Tag:** `v100-website-razorpay-page-stable`

### Cloud Run Revisions:
*   **Main Web:** `jsmf-web-main-00041-4z7`
*   **PDF Web:** `jsmf-pdf-web-00028-j7s`
*   **Backend API:** `jsmf-backend-00055-nrl`

### Changes
*   Initial deployment of Main Web, PDF Web, and Backend APIs.
*   Google OAuth authentication integration.
*   MSG91 Email and SMS infrastructure.
