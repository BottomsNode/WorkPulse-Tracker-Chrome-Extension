importScripts('config.js');

const WORK_MINUTES = 510; // 8.5 hours
const BREAK_REMINDER_MINUTES = 120; // every 2 hours
const AUTO_REFRESH_MINUTES = 5;

const ATTENDANCE_API = DEFAULT_HRMS.hrmsApi;
const hrmsToken = DEFAULT_HRMS.hrmsToken;
const hrmsUser = DEFAULT_HRMS.hrmsUser;

let hrmsData = { workStart: null, workEnd: null, breaks: [] };

// --- FETCH HRMS DATA ---
async function fetchHRMSAttendance() {
    try {
        const res = await fetch(ATTENDANCE_API, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${hrmsToken}`,
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        mapHRMSData(data);

        // Schedule reminders
        const expectedCheckout = getCheckoutTime();
        if (expectedCheckout) {
            scheduleCheckoutReminder(expectedCheckout);
            scheduleOvertimeCheck();
        }

    } catch (err) {
        console.error("[Background] ❌ Error fetching HRMS attendance:", err);
    }
}

function mapHRMSData(data) {
    hrmsData.workStart = null;
    hrmsData.workEnd = null;
    hrmsData.breaks = [];

    if (!data.listings) return;

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const todayListings = data.listings.filter(item => {
        const eventDate = new Date(item["0"].date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return eventDate === today;
    });

    todayListings.forEach(item => {
        const date = new Date(item["0"].date);
        switch (item.type) {
            case "Checked In":
                if (!hrmsData.workStart) hrmsData.workStart = date;
                break;
            case "Checked Out":
                hrmsData.workEnd = date;
                break;
            case "Breaked In":
                hrmsData.breaks.push({ start: date, end: null, duration: 0 });
                break;
            case "Breaked Out":
                const lastBreak = hrmsData.breaks.find(b => b.end === null);
                if (lastBreak) {
                    lastBreak.end = date;
                    lastBreak.duration = lastBreak.end - lastBreak.start;
                }
                break;
        }
    });
}

function getCheckoutTime() {
    if (!hrmsData.workStart) return null;
    const breakMinutes = hrmsData.breaks.reduce((sum, b) => {
        const dur = b.end ? (b.end - b.start) : (Date.now() - b.start);
        return sum + dur;
    }, 0) / 60000;
    return new Date(hrmsData.workStart.getTime() + WORK_MINUTES * 60000 + breakMinutes * 60000);
}

function getSummaryText() {
    let text = '';
    if (hrmsData.workStart) text += `Check In: ${hrmsData.workStart.toLocaleTimeString()}\n`;
    if (hrmsData.workEnd) text += `Check Out: ${hrmsData.workEnd.toLocaleTimeString()}\n`;
    if (hrmsData.breaks.length) {
        text += 'Breaks:\n';
        hrmsData.breaks.forEach((b, i) => {
            const duration = b.end ? Math.floor((b.end - b.start) / 60000) : Math.floor((Date.now() - b.start) / 60000);
            text += `  ${i + 1}. ${b.start.toLocaleTimeString()} - ${b.end ? b.end.toLocaleTimeString() : 'ongoing'} (${duration} min)\n`;
        });
    }
    if (hrmsData.workStart && !hrmsData.workEnd) {
        const expected = getCheckoutTime();
        if (expected) text += `Expected Checkout: ${expected.toLocaleTimeString()}`;
    }
    return text;
}

// --- ALARMS & NOTIFICATIONS ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("breakReminder", { periodInMinutes: BREAK_REMINDER_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    switch (alarm.name) {
        case "breakReminder":
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon48.png",
                title: "WorkPulse Tracker",
                message: "🚶 Time to take a short break!",
                priority: 2
            });
            break;

        case "checkoutReminder":
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon48.png",
                title: "WorkPulse Tracker",
                message: "⏰ Only 15 minutes left until your expected checkout!",
                priority: 2
            });
            break;

        case "overtimeReminder":
            if (!hrmsData.workEnd) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon48.png",
                    title: "WorkPulse Tracker",
                    message: "⚠️ You are past your expected checkout time!",
                    priority: 2
                });
            } else {
                chrome.alarms.clear("overtimeReminder");
            }
            break;
    }
});

// --- REMINDERS ---
function scheduleCheckoutReminder(expectedCheckoutTime) {
    const now = new Date();
    const reminderTime = new Date(expectedCheckoutTime.getTime() - 15 * 60000); // 15 min before checkout
    if (reminderTime > now) {
        chrome.alarms.create("checkoutReminder", { when: reminderTime.getTime() });
        console.log("[Background] Checkout reminder scheduled at", reminderTime.toLocaleTimeString());
    }
}

function scheduleOvertimeCheck() {
    if (!hrmsData.workStart || hrmsData.workEnd) return;

    const expectedCheckout = getCheckoutTime();
    if (!expectedCheckout) return;

    chrome.alarms.get("overtimeReminder", (alarm) => {
        if (alarm) return; // already scheduled

        const now = new Date();
        const firstTrigger = now > expectedCheckout ? now.getTime() + 1000 : expectedCheckout.getTime();

        chrome.alarms.create("overtimeReminder", { when: firstTrigger, periodInMinutes: 15 });
        console.log("[Background] Overtime reminder scheduled.", new Date(firstTrigger).toLocaleTimeString());
    });
}

// --- MESSAGE HANDLER ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "getSummary") {
        fetchHRMSAttendance().then(() => {
            const summary = getSummaryText();
            sendResponse({ summary });
        }).catch(err => {
            console.error("[Background] Error in getSummary:", err);
            sendResponse({ summary: "⚠️ Unable to fetch HRMS data" });
        });
        return true;
    }

    if (msg.action === "getHRMSUser") {
        sendResponse({ hrmsUser });
    }
});
