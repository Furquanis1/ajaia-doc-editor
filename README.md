# Ajaia Collaborative Document Editor

A lightweight collaborative document editor built for the Ajaia Full Stack Product Engineer assessment. 

## Local Setup & Run Instructions

### Prerequisites
* Node.js (v18 or higher)
* npm

### 1. Start the Backend API
Open a terminal and run:
```bash
cd server
npm install
npm run db:init  # Initializes the SQLite database and seeds users
npm start        # Starts the API on http://localhost:3001
```

### 2. Start the Frontend Client
Open a second terminal and run:
```bash
cd client
npm install
npm run dev      # Starts the Vite dev server on http://localhost:5173
```

### 3. Run Automated Tests
To verify the backend access control and sharing logic:
```bash
cd server
npm test
```

### Testing the App
* Open `http://localhost:5173` in your browser.
* Use the user switcher in the top right (Alice, Bob, Charlie) to test authorization and sharing flows.
