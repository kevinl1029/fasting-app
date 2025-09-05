# Feature Specification: Fasting Log

## 1. Overview
The **Fasting Log** gives users a historical record of all their completed fasts, with the ability to **review, edit, and add fasts**. This feature turns fasting into a continuous narrative rather than isolated sessions, helping users see long-term consistency and progress.

---

## 2. Goals
- Provide a **chronological history** of fasting activity.  
- Allow users to **edit or add fasts** for accuracy.  
- Increase motivation by showing streaks, totals, and detailed summaries in one place.  
- Serve as the foundation for deeper analytics (weekly/monthly trends).  

---

## 3. Core Requirements

### 3.1 Fast History
- List view of past fasts, sorted by most recent.  
- Each fast entry shows:  
  - Date range (start → end).  
  - Total duration.  
  - Protocol type (e.g., 16:8, custom).  
  - Milestones reached (icons or labels).  
- Expandable view → details: notes, weight, photos, refeed log.  

### 3.2 Add Fast (Manual Entry)
- “+ Add Fast” button in Fasting Log.  
- Manual input:  
  - Start date & time.  
  - End date & time.  
  - Protocol (optional).  
  - Notes (optional).  
- Entry appears in log with a “manual” indicator.  

### 3.3 Edit Fast
- Tap an existing entry → edit modal.  
- Editable fields: start/end time, protocol, notes, weight, photos.  
- Warning/tooltip: “Editing may change streaks and totals.”  

### 3.4 Integrity Indicators
- **Tracked Live** vs. **Manual Entry** labeled clearly.  
- Color-coded icons (e.g., green = live, gray = manual).  

### 3.5 Integration with Other Features
- **Streaks & Totals** update dynamically based on log contents.  
- **Dashboard Charts** pull from log data.  
- **Achievements** (e.g., “Longest Fast”) reference log entries.  

---

## 4. UI Mockups (Wireframe-Level Descriptions)
- **Fasting Log Screen**:  
  - List of fasts → cards with date, duration, protocol.  
  - Top summary: streak count, cumulative hours.  
  - FAB: “+ Add Fast.”  
- **Fast Detail View**:  
  - Expanded card with milestones, notes, weight, photos.  
  - CTA: Edit.  

---

## 5. Design Considerations
- Keep primary Timer flow uncluttered; Fasting Log is a secondary tab/section.  
- Ensure manual entries don’t feel like “cheating” — keep tone supportive.  
- Clear disclaimer: milestone times are approximations for manual fasts.  
- Sync with schedule: if a scheduled fast was missed, suggest logging it manually.  

---

## 6. Future Enhancements
- **Import from Wearables** (auto-fill fasts from Apple Health, Fitbit, etc.).  
- **Trend Analysis** (weekly average fast length, adherence rate).  
- **Tags/Categories** (e.g., “travel fast,” “prep fast”).  

