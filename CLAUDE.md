# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the "fasting-forecast" project - a web application for forecasting fat loss from water fasting. It features a Node.js/Express backend with complex metabolic calculations and a frontend web interface.

## Technology Stack

- **Backend**: Node.js with Express.js
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Dependencies**: express, cors
- **Dev Dependencies**: nodemon for development

## Development Commands

```bash
# Install dependencies
npm install

# Start production server
npm start

# Start development server with auto-restart
npm run dev
```

## Architecture

### Backend (server.js)
- Express server serving on port 3000 (configurable via PORT env var)
- Static file serving from `public/` directory
- CORS enabled for cross-origin requests
- JSON parsing middleware

### API Endpoints
- `GET /api/hello` - Health check endpoint
- `GET /api/time` - Returns current server time
- `POST /api/calculate` - Complex fasting forecast calculations with multi-phase ketosis modeling

### Calculation Engine
The `/api/calculate` endpoint implements sophisticated metabolic modeling:
- Multi-phase ketosis transitions (glycogen depletion → early → full → optimal ketosis)
- Personalized adjustments for insulin sensitivity, fasting experience, and body fat percentage
- Fat oxidation limitations for lean individuals (≤10% body fat)
- FFM preservation factors that improve with deeper ketosis states
- Weekly simulation with hour-by-hour metabolic state tracking

### Frontend (public/index.html)
- Single-page application with form-based input
- Real-time calculation results display
- Responsive design with modern CSS styling

## Project Structure

```
fasting-forecast/
├── server.js          # Express server with calculation engine
├── package.json       # Dependencies and npm scripts
├── public/
│   └── index.html     # Frontend web interface
└── README.md          # Project documentation
```

## Key Calculation Parameters

The application uses research-based constants for metabolic modeling:
- Fat energy: 7700 kcal/kg
- FFM energy: 1000 kcal/kg  
- Fat oxidation cap: 69 kcal/kg-fat/day (for lean individuals)
- Ketosis phase transitions: 16h → 24h → 48h → 72h (with personalization adjustments)
- FFM preservation improves from 0% → 40% across ketosis phases