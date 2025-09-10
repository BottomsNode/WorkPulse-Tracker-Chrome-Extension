async function fetchHRMSData() {
    try {
        const res = await fetch(DEFAULT_HRMS.hrmsApi, {
            headers: { "Authorization": `Bearer ${DEFAULT_HRMS.hrmsToken}` }
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
    } catch (err) {
        console.error("HRMS fetch failed:", err);
        return null;
    }
}

function updateStatus(text) {
    document.getElementById("status").innerText = text;
}

function updateSummary(summary) {
    const summaryDiv = document.getElementById("summary");
    if (!summary) return summaryDiv.innerHTML = "";
    const lines = summary.split("\n").filter(l => l.trim() !== "");
    let html = "";

    lines.forEach(line => {
        if (line.startsWith("Check In:")) {
            html += `<div class="summary-item checkin">
                        <span class="label">Check In</span>
                        <span class="value">${line.replace("Check In:", "").trim()}</span>
                     </div>`;
        } else if (line.startsWith("Check Out:")) {
            html += `<div class="summary-item checkout">
                        <span class="label">Check Out</span>
                        <span class="value">${line.replace("Check Out:", "").trim()}</span>
                     </div>`;
        } else if (line.startsWith("Expected Checkout:")) {
            html += `<div class="summary-item expected">
                        <span class="label">Expected Checkout</span>
                        <span class="value">${line.replace("Expected Checkout:", "").trim()}</span>
                     </div>`;
        } else if (line.startsWith("Breaks:")) {
            html += `<div class="summary-header">🛑 Breaks</div>`;
        } else if (/^\s*\d+\./.test(line)) {
            const match = line.match(/(\d+)\.\s*(.*?)\s*-\s*(.*?)\s*\((.*?)\)/);
            if (match) {
                const [_, index, start, end, duration] = match;
                html += `<div class="break-card" title="Break #${index}: ${start} → ${end} (${duration})">
                            <div class="break-index">#${index}</div>
                            <div class="break-time">${start} → ${end}</div>
                            <div class="break-duration">⏱ ${duration}</div>
                         </div>`;
            } else {
                html += `<div class="break-item">${line}</div>`;
            }
        } else {
            html += `<div class="summary-text">${line}</div>`;
        }
    });

    summaryDiv.innerHTML = html;
}

function animateProgressRing(ring, percent, duration = 1000) {
    const radius = ring.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = circumference;

    let start = null;

    function step(timestamp) {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const currentOffset = circumference * (1 - (percent / 100) * progress);
        ring.style.strokeDashoffset = currentOffset;

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

function updateProgress(summary) {
    let workStart = null, workEnd = null, breaks = [];
    const today = new Date().toISOString().split("T")[0];

    summary.split("\n").forEach(line => {
        if (line.startsWith("Check In:")) {
            const t = line.replace("Check In:", "").trim();
            if (t) workStart = new Date(`${today}T${t}`);
        }
        if (line.startsWith("Check Out:")) {
            const t = line.replace("Check Out:", "").trim();
            if (t) workEnd = new Date(`${today}T${t}`);
        }
        if (line.includes("-") && line.includes("min")) {
            const parts = line.split("-");
            const start = new Date(`${today}T${parts[0].replace(/\d+\.\s*/, "").trim()}`);
            const end = new Date(`${today}T${parts[1].split("(")[0].trim()}`);
            const duration = (end - start);
            breaks.push({ start, end, duration });
        }
    });

    const ring = document.querySelector(".ring-progress");
    const percentText = document.getElementById("progress-text");
    const remainingText = document.getElementById("remaining-text");

    if (!workStart) {
        ring.style.strokeDasharray = 0;
        percentText.textContent = "0%";
        remainingText.textContent = "Not started";
        remainingText.style.fill = "#666";
        return;
    }

    const WORK_MINUTES = 510;
    const totalBreakMinutes = breaks.reduce((s, b) => s + (b.duration || 0), 0) / 60000;
    const expectedCheckout = new Date(workStart.getTime() + (WORK_MINUTES + totalBreakMinutes) * 60000);

    const now = workEnd || new Date();
    let completedMinutes = ((now - workStart) / 60000);
    if (completedMinutes < 0) completedMinutes = 0;

    const percent = Math.min((completedMinutes / (WORK_MINUTES + totalBreakMinutes)) * 100, 100);

    // Animate ring
    animateProgressRing(ring, percent, 1000);

    // Dynamic color
    let color = "#4caf50";
    if (percent >= 50) color = "#4caf50";
    else if (percent >= 20) color = "#ff9800";
    else color = "#f44336";

    ring.style.stroke = color;
    remainingText.style.fill = color;

    percentText.textContent = `${Math.round(percent)}%`;

    const remainingMinutes = Math.max(Math.round((expectedCheckout - now) / 60000), 0);
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = Math.floor(remainingMinutes % 60);
    remainingText.textContent = `${hours}h ${minutes}m`;
}

async function refreshData() {
    const spinner = document.getElementById("spinner");
    const ringContainer = document.getElementById("progress-ring-container");
    spinner.style.display = "flex";
    ringContainer.style.display = "none";

    const data = await fetchHRMSData();
    const summaryText = generateSummaryText(data);
    updateStatus("✅ Data synced from HRMS");
    updateSummary(summaryText);
    updateProgress(summaryText);

    spinner.style.display = "none";
    ringContainer.style.display = "flex";
}

function generateSummaryText(data) {
    if (!data || !data.listings) return "⚠️ Unable to fetch HRMS data";

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    let workStart = null, workEnd = null;
    const breaks = [];

    const todayListings = data.listings.filter(item =>
        new Date(item["0"].date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === today
    );

    todayListings.forEach(item => {
        const date = new Date(item["0"].date);
        if (item.type === "Checked In" && !workStart) workStart = date;
        if (item.type === "Checked Out") workEnd = date;
        if (item.type === "Breaked In") breaks.push({ start: date, end: null });
        if (item.type === "Breaked Out") {
            const lastBreak = breaks.find(b => !b.end);
            if (lastBreak) lastBreak.end = date;
        }
    });

    let txt = "";
    if (workStart) txt += `Check In: ${workStart.toLocaleTimeString()}\n`;
    if (workEnd) txt += `Check Out: ${workEnd.toLocaleTimeString()}\n`;
    if (breaks.length) {
        txt += "Breaks:\n";
        breaks.forEach((b, i) => {
            const dur = Math.floor(((b.end || new Date()) - b.start) / 60000);
            txt += `  ${i + 1}. ${b.start.toLocaleTimeString()} - ${b.end ? b.end.toLocaleTimeString() : 'ongoing'} (${dur} min)\n`;
        });
    }
    if (workStart && !workEnd) {
        const totalBreakMinutes = breaks.reduce((s, b) => s + ((b.end ? b.end : new Date()) - b.start) / 60000, 0);
        const expectedCheckout = new Date(workStart.getTime() + (510 + totalBreakMinutes) * 60000);
        txt += `Expected Checkout: ${expectedCheckout.toLocaleTimeString()}`;
    }
    return txt;
}

// Auto-refresh every 2 minutes
refreshData();
setInterval(refreshData, 120000);
