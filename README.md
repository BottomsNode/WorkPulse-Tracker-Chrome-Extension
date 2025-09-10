# WorkPulse Tracker

WorkPulse Tracker is a productivity and attendance monitoring tool that helps employees track their work hours, breaks, and expected checkout times. It is available as both a **Chrome Extension** and a **mobile-friendly web app**.  

---

## Features

- **Automatic HRMS sync**: Fetches attendance data directly from your HRMS.
- **Check-in / Check-out tracking**: Displays work start, end, and expected checkout times.
- **Break tracking**: Shows ongoing and past breaks.
- **Visual progress ring**: Circular progress indicator with dynamic color and animations.
- **Notifications** (Chrome extension only): Reminds you to take breaks and alerts for overtime.
- **Mobile-friendly**: Fully responsive design with smooth animations for modern devices.
- **Dark mode and shadows**: Modern UI without affecting core functionality.

---

## Table of Contents

1. [Chrome Extension](#chrome-extension)
2. [Mobile Web App](#mobile-web-app)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Usage](#usage)
6. [Screenshots](#screenshots)
7. [License](#license)

---

## Chrome Extension

### Files

- `manifest.json` – Extension metadata and permissions.
- `popup.html` – Popup UI for the extension.
- `popup.js` – Handles data fetching, parsing, and rendering.
- `background.js` – Handles background tasks, alarms, and notifications.
- `config.js` – Stores HRMS API endpoint and credentials.
- `style.css` – UI styling for the popup.
- `icon48.png` – Extension icon.

### Features

- Fetches attendance data from HRMS.
- Displays check-in, check-out, breaks, and expected checkout.
- Visual circular progress ring with color-coded status.
- Notifications for breaks and overtime.
- Auto-refresh every 2 minutes.

### Installation

1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the extension folder.

---

## Mobile Web App

### Files

- `index.html` – Main HTML page.
- `style.css` – Mobile-responsive styling with dark mode and shadows.
- `app.js` – Handles fetching, parsing, and rendering attendance data.
- `config.js` – Stores HRMS API endpoint and credentials.
- `spinner.gif` – Loading indicator.

### Features

- Fetches HRMS data directly from your API.
- Responsive layout for phones.
- Circular progress ring with smooth animations.
- Displays check-in, check-out, breaks, and expected checkout.
- Auto-refresh every 2 minutes.

### Deployment

You can deploy the mobile app as a static site on platforms like **Vercel**:

```bash
npm i -g vercel
vercel
vercel --prod
