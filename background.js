importScripts('config.js');

const WORK_MINUTES = 510; // 8.5 hours
const BREAK_REMINDER_MINUTES = 120; // 2h
const ATTENDANCE_API = DEFAULT_HRMS.hrmsApi;
const hrmsToken = DEFAULT_HRMS.hrmsToken;
const hrmsUser = DEFAULT_HRMS.hrmsUser;

let hrmsData = { workStart: null, workEnd: null, breaks: [] };
let lastRefreshDate = null;

// --- HRMS Fetch ---
async function fetchHRMSAttendance() {
    try {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

        // Reset each day
        if (lastRefreshDate !== today) {
            console.log("[Background] New day → resetting HRMS data & alarms.");
            hrmsData = { workStart: null, workEnd: null, breaks: [] };
            chrome.alarms.clearAll();
            chrome.alarms.create("breakReminder", { periodInMinutes: BREAK_REMINDER_MINUTES });
            lastRefreshDate = today;
        }

        const res = await fetch(ATTENDANCE_API, {
            headers: { "Authorization": `Bearer ${hrmsToken}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        mapHRMSData(data);

        // Today’s reminders
        const expectedCheckout = getCheckoutTime();
        if (expectedCheckout) {
            scheduleCheckoutReminder(expectedCheckout);
            scheduleOvertimeCheck();
        }
    } catch (err) {
        console.error("[Background] ❌ HRMS fetch failed:", err);
    }
}

function mapHRMSData(data) {
    hrmsData = { workStart: null, workEnd: null, breaks: [] };
    if (!data.listings) return;

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const todayListings = data.listings.filter(item =>
        new Date(item["0"].date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === today
    );

    todayListings.forEach(item => {
        const date = new Date(item["0"].date);
        if (item.type === "Checked In" && !hrmsData.workStart) hrmsData.workStart = date;
        if (item.type === "Checked Out") hrmsData.workEnd = date;
        if (item.type === "Breaked In") hrmsData.breaks.push({ start: date, end: null, duration: 0 });
        if (item.type === "Breaked Out") {
            const lastBreak = hrmsData.breaks.find(b => !b.end);
            if (lastBreak) {
                lastBreak.end = date;
                lastBreak.duration = lastBreak.end - lastBreak.start;
            }
        }
    });
}

function getCheckoutTime() {
    if (!hrmsData.workStart) return null;
    const breakMinutes = hrmsData.breaks.reduce((s, b) => {
        const dur = b.end ? (b.end - b.start) : (Date.now() - b.start);
        return s + dur;
    }, 0) / 60000;
    return new Date(hrmsData.workStart.getTime() + (WORK_MINUTES + breakMinutes) * 60000);
}

function getSummaryText() {
    let txt = '';
    if (hrmsData.workStart) txt += `Check In: ${hrmsData.workStart.toLocaleTimeString()}\n`;
    if (hrmsData.workEnd) txt += `Check Out: ${hrmsData.workEnd.toLocaleTimeString()}\n`;
    if (hrmsData.breaks.length) {
        txt += "Breaks:\n";
        hrmsData.breaks.forEach((b, i) => {
            const dur = Math.floor(((b.end || new Date()) - b.start) / 60000);
            txt += `  ${i + 1}. ${b.start.toLocaleTimeString()} - ${b.end ? b.end.toLocaleTimeString() : 'ongoing'} (${dur} min)\n`;
        });
    }
    if (hrmsData.workStart && !hrmsData.workEnd) {
        const expected = getCheckoutTime();
        if (expected) txt += `Expected Checkout: ${expected.toLocaleTimeString()}`;
    }
    return txt;
}

// --- Notifications ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("breakReminder", { periodInMinutes: BREAK_REMINDER_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
    console.log("[Background] Startup cleanup.");
    chrome.alarms.clearAll();
    chrome.alarms.create("breakReminder", { periodInMinutes: BREAK_REMINDER_MINUTES });
    hrmsData = { workStart: null, workEnd: null, breaks: [] };
    lastRefreshDate = null;
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "breakReminder") {
        chrome.notifications.create({
            type: "basic", iconUrl: "icon48.png", title: "WorkPulse Tracker",
            message: "🚶 Time to move! Take a quick break.", priority: 2
        });
    }
    if (alarm.name === "checkoutReminder") {
        chrome.notifications.create({
            type: "basic", iconUrl: "icon48.png", title: "WorkPulse Tracker",
            message: "⏰ 15 minutes left until checkout.", priority: 2
        });
    }
    if (alarm.name === "overtimeReminder" && !hrmsData.workEnd) {
        chrome.notifications.create({
            type: "basic", iconUrl: "icon48.png", title: "WorkPulse Tracker",
            message: "⚠️ You’re working overtime!", priority: 2
        });
    }
});

function scheduleCheckoutReminder(expectedCheckoutTime) {
    const reminderTime = new Date(expectedCheckoutTime.getTime() - 15 * 60000);
    if (reminderTime > new Date())
        chrome.alarms.create("checkoutReminder", { when: reminderTime.getTime() });
}

function scheduleOvertimeCheck() {
    if (!hrmsData.workStart || hrmsData.workEnd) return;
    const expected = getCheckoutTime();
    if (!expected) return;
    chrome.alarms.get("overtimeReminder", (alarm) => {
        if (!alarm) chrome.alarms.create("overtimeReminder", { when: expected.getTime(), periodInMinutes: 15 });
    });
}

// --- Messaging ---
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg.action === "getSummary") {
        fetchHRMSAttendance().then(() => sendResponse({ summary: getSummaryText() }))
            .catch(() => sendResponse({ summary: "⚠️ Unable to fetch HRMS data" }));
        return true;
    }
    if (msg.action === "getHRMSUser") sendResponse({ hrmsUser });
});
