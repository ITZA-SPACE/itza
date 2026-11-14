# Demo video (30 seconds or less)

Beat sheet and constraints: docs/DEMO_STRATEGY.md section 4. Capture from guided demo mode (`/demo`, offline, `P` to autoplay) at 1080p, 60 fps; screen capture only, so no person appears and nothing is SI-generated; no NASA logos beyond data-source names already in the app; English voice-over or burned-in subtitles; music only if original or licensed.

Check the limit before uploading (the file name is yours):

    node scripts/submission.mjs limits submission/video/itza.mp4

Exit code 1 means the video is over 30.0 s or the deck over 7 slides. Video files are not committed; host the video publicly (no login) and link it in the Project page.
