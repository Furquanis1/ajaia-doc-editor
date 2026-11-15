# Architecture & Tradeoffs

**Candidate:** Furquan Khan (ifurquankhan7@gmail.com)

## Tech Stack
* **Frontend:** React 18, Vite, Tailwind CSS, TipTap (Editor)
* **Backend:** Node.js, Express
* **Database:** SQLite

## Why This Stack?
I chose this stack because it is lightweight and easy for reviewers to run. SQLite provides solid local data storage without requiring you to set up a PostgreSQL server or provide database credentials just to test my code. 

## Code Consistency
To keep the codebase easy to read and maintain, I strictly centralized core logic:
* **Database Access:** All SQL queries live in `server/db.js`. 
* **API Calls:** All frontend network requests are kept in `client/src/api.js`. React components only handle UI state, not network logic.
* **Access Control:** A single Express middleware handles user identity, ensuring authorization rules are applied consistently across every route.

## Tradeoffs & Scope Cuts
With a strict 4-hour limit, I had to prioritize core stability over extra features:
1. **Real-time collaboration was cut:** I chose to build a highly reliable debounced autosave rather than risk a buggy WebSockets implementation.
2. **Mocked Authentication:** Instead of building a full login system, I seeded three users (Alice, Bob, Charlie) and built a quick UI switcher. This makes it completely frictionless for you to test the sharing and permission logic.
3. **Ephemeral Hosting:** The live app is deployed on Render's free tier. Because Render uses an ephemeral file system, the database resets to its seeded state if the server goes to sleep. In a real production environment, I would swap the SQLite adapter for PostgreSQL.
