# Schedule Feature Implementation Plan

## Phase 1: Database Foundation (Week 1)
**Goal**: Set up the core data model and database schema

### 1.1 Database Schema
- Create `schedules` table with user_id, week_anchor, is_paused flags
- Create `fasting_blocks` table with schedule relationships, timing, timezone modes
- Create `overrides` table for one-off schedule modifications  
- Create `planned_instances` table (or computed view) for materialized schedule instances
- Update existing `fast_sessions` table to link with planned instances

### 1.2 Database Methods
- Add CRUD operations for schedules, fasting blocks, and overrides
- Implement instance generation logic (compute next N occurrences from blocks)
- Add timezone conversion utilities
- Create methods for schedule validation (overlap detection, conflict resolution)

## Phase 2: Backend API (Week 1-2) 
**Goal**: Build the REST API endpoints to support the Schedule feature

### 2.1 Core Schedule APIs
- `GET /api/schedule` - Get user's schedule with blocks and next instances
- `POST/PATCH /api/schedule/blocks` - Create/update fasting blocks
- `DELETE /api/schedule/blocks/:id` - Delete fasting block
- `POST /api/schedule/blocks/:id/overrides` - Create one-off modifications

### 2.2 Action APIs  
- `POST /api/instances/:id/actions` - Handle start early, skip, shift, extend actions
- `POST /api/schedule/preview` - Preview next N occurrences for draft blocks
- `POST /api/schedule/forecast-preview` - Generate lightweight trajectory preview

### 2.3 Integration Updates
- Update timer endpoints to check for scheduled instances
- Modify fast creation to auto-link with scheduled instances when applicable
- Update existing fast logging to capture planned vs actual data

## Phase 3: Frontend Schedule Page (Week 2-3)
**Goal**: Build the main Schedule interface with grid/list views

### 3.1 Schedule Page Structure
- Create `/public/schedule.html` with responsive layout matching current app design
- Implement weekly grid view (7 days × 24 hours with colored fasting/feeding bands)
- Build alternate list view toggle ("Wed 20:00 → Sat 16:00, 68h")
- Add metrics header (planned hours, adherence, block count)

### 3.2 Block Management
- Create fasting block creation/editing modal forms
- Implement day/time pickers with validation
- Add timezone behavior selection (local vs anchor modes)
- Build conflict detection and resolution UI (merge/trim options)

### 3.3 Quick Actions
- Implement override actions: skip, shift times, start early, extend/shorten
- Add "Start Early" integration with Timer page detection
- Create batch actions for vacation mode (pause all blocks)

## Phase 4: Timer Integration (Week 3)
**Goal**: Connect Schedule with existing Timer functionality

### 4.1 Timer Page Updates
- Detect upcoming scheduled fasts within 6 hours
- Show "Upcoming: Wed 20:00" banner with edit/start early options
- Modify "Start Fast" button behavior to detect scheduled instances
- Add choice dialog: "Start scheduled fast early?" vs "Start ad-hoc fast"

### 4.2 Active Fast Integration
- Display schedule context when timer is running a scheduled fast
- Show milestone progress aligned with ketosis phases
- Enable mid-fast schedule detachment ("Convert to ad-hoc")

## Phase 5: Navigation Integration (Week 3-4)
**Goal**: Integrate Schedule into existing app navigation

### 5.1 Navigation Updates
- Add Schedule tab to bottom navigation (already exists in welcome.html)
- Implement proper routing from `/schedule` server endpoint
- Update navigation active state handling
- Ensure consistent styling with existing nav design

### 5.2 Cross-Page Integration  
- Add schedule preview cards to Dashboard
- Update welcome flow to include schedule setup option
- Link forecast preview back to Dashboard forecast view

## Phase 6: Notifications & Lifecycle (Week 4)
**Goal**: Implement the notification and automated scheduling system

### 6.1 Notification System
- Create pre-start notifications (T-3h, T-30m configurable)
- Implement start window auto-start with grace period
- Add milestone notifications during scheduled fasts
- Build end-of-fast celebration notifications

### 6.2 Automation
- Auto-start scheduled fasts (with user preference settings)
- Auto-log completed scheduled fasts with planned vs actual tracking
- Handle timezone changes and DST transitions
- Implement missed fast tracking and recovery options

## Phase 7: Polish & Edge Cases (Week 4-5)
**Goal**: Handle edge cases, add templates, and improve UX

### 7.1 Templates & Onboarding
- Create common schedule templates (16:8, OMAD, 24h 2x/week, etc.)
- Build schedule setup wizard for new users
- Add template preview functionality
- Integrate with existing onboarding flow

### 7.2 Edge Cases
- Handle travel/timezone change scenarios with clear explanations
- Implement DST transition previews and warnings
- Add multi-device conflict resolution
- Create comprehensive error handling and user feedback

## Phase 8: Forecast Preview Integration (Week 5)
**Goal**: Connect Schedule with existing Fat Loss Forecaster

### 8.1 Preview Generation
- Integrate with existing forecast calculation engine in `/api/calculate`
- Generate lightweight trajectory previews from planned weekly hours
- Create sparkline visualizations for weight/body fat projections
- Build confirmation screen with forecast preview after schedule saves

### 8.2 Dashboard Handoff
- Ensure smooth navigation from Schedule → Dashboard forecast view
- Update Dashboard to show schedule-based vs ad-hoc forecast comparisons
- Add adherence tracking and variance metrics

## Technical Considerations

### Database Design
- Use SQLite with existing schema pattern
- Leverage existing user_profiles relationship
- Ensure timezone data is properly stored as UTC with local timezone context

### Frontend Architecture  
- Follow existing vanilla JS pattern (no frameworks)
- Use consistent styling with current gradient theme and card layouts
- Maintain mobile-responsive design patterns from existing pages

### Integration Points
- Timer page: `/public/timer.html` modifications
- Database: `/database/db.js` extensions  
- Server: `/server.js` new endpoints
- Navigation: Update existing bottom nav implementation

This plan prioritizes core functionality first (data model, API, basic UI), then builds up integration points and polish. Each phase delivers working functionality that can be tested independently.