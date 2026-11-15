# AI Workflow Note

## Tools Used
* **OpenCode / LLMs** (acting as coding agents)

## How I Guided the AI
I operated as the technical orchestrator for this build. Instead of asking the AI to generate the entire application at once—which usually leads to messy code and lost context—I forced a strict, step-by-step pipeline.

I divided the project into 6 isolated phases:
1. Server scaffold and database schema
2. Core API and access control logic
3. Frontend routing and dashboard UI
4. TipTap editor integration
5. Autosave and manual save logic
6. File upload and share modals

## Verification & Adjustments
I did not blindly trust the AI output. I verified correctness by:
* **Writing Automated Tests First:** Before touching the frontend, I required the AI to write a Jest/Supertest suite for the backend. I verified that the 403 Forbidden logic worked at the API level first.
* **Maintaining State:** I kept a running `PROJECT_STATE.md` file. After every phase, I updated this file so the AI always had an accurate map of what was actually built versus what was planned.
* **Rejecting Bloat:** I rejected initial assumptions about adding complex UI frameworks, forcing the use of plain Tailwind CSS to keep the bundle size small and the codebase readable.
