# Fasting Forecast

A web application for forecasting fat loss from water fasting, built with Node.js/Express backend and HTML/CSS/JavaScript frontend.

## Features

- **Backend**: Express.js server with REST API endpoints
- **Frontend**: Simple HTML page with modern styling
- **API Endpoints**: 
  - `GET /api/hello` - Returns a greeting message
  - `GET /api/time` - Returns current server time
- **Static File Serving**: Serves the frontend from the `public` directory

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. For development with auto-restart:
   ```bash
   npm run dev
   ```

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Use the buttons to test the backend API endpoints
3. View the responses in real-time

## Project Structure

```
fasting-forecast/
├── server.js          # Express server
├── package.json       # Dependencies and scripts
├── public/            # Frontend files
│   └── index.html     # Main HTML page
└── README.md          # This file
```

## Next Steps

This is a minimal setup to get you started. You can expand by:
- Adding a database
- Creating more API endpoints
- Building a more complex frontend (React, Vue, etc.)
- Adding authentication
- Implementing real-time features with WebSockets
