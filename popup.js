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
        }
        else if (line.startsWith("Check Out:")) {
            html += `<div class="summary-item checkout">
                        <span class="label">Check Out</span>
                        <span class="value">${line.replace("Check Out:", "").trim()}</span>
                     </div>`;
        }
        else if (line.startsWith("Expected Checkout:")) {
            html += `<div class="summary-item expected">
                        <span class="label">Expected Checkout</span>
                        <span class="value">${line.replace("Expected Checkout:", "").trim()}</span>
                     </div>`;
        }
        else if (line.startsWith("Breaks:")) {
            html += `<div class="summary-header">🛑 Breaks</div>`;
        }
        else if (/^\s*\d+\./.test(line)) {
            // Example: "1. 11:16:41 - 11:36:10 (19 min)"
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
        }
        else {
            html += `<div class="summary-text">${line}</div>`;
        }
    });

    summaryDiv.innerHTML = html;
}

function updateProgress(summary) {
    let workStart = null, workEnd = null, breaks = [];
    const today = new Date().toISOString().split("T")[0];

    // Parse summary lines
    summary.split("\n").forEach(line => {
        if (line.startsWith("Check In:")) {
            const t = line.replace("Check In:", "").trim();
            if (t) workStart = new Date(`${today}T${t}`);
        }
        if (line.startsWith("Check Out:")) {
            const t = line.replace("Check Out:", "").trim();
            if (t) workEnd = new Date(`${today}T${t}`);
        }
        if (/^\s*\d+\./.test(line) && line.includes("min")) {
            const parts = line.split("-");
            const start = new Date(`${today}T${parts[0].replace(/\d+\.\s*/, "").trim()}`);
            const end = new Date(`${today}T${parts[1].split("(")[0].trim()}`);
            breaks.push({ start, end, duration: (end - start) });
        }
    });

    const ring = document.querySelector(".ring-progress");
    const percentText = document.getElementById("progress-text");
    const remainingText = document.getElementById("remaining-text");

    if (!workStart) {
        ring.style.strokeDasharray = "0";
        ring.style.strokeDashoffset = "0";
        percentText.textContent = "0%";
        remainingText.textContent = "Not started";
        remainingText.style.fill = "#666";
        return;
    }

    // --- Calculate total work and break minutes ---
    const WORK_MINUTES = 510; // 8.5 hours
    const totalBreakMinutes = breaks.reduce((sum, b) => sum + (b.duration || 0), 0) / 60000;
    const expectedCheckout = new Date(workStart.getTime() + (WORK_MINUTES + totalBreakMinutes) * 60000);

    const now = workEnd || new Date();
    let completedMinutes = Math.max((now - workStart) / 60000, 0);
    const percent = Math.min((completedMinutes / (WORK_MINUTES + totalBreakMinutes)) * 100, 100);

    // --- Update ring dynamically ---
    const radius = ring.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    ring.style.strokeDasharray = circumference;
    ring.style.transition = "stroke-dashoffset 0.8s ease, stroke 0.5s ease";
    ring.style.strokeDashoffset = circumference * (1 - percent / 100);

    // --- Color logic ---
    let color = "#4caf50";
    if (percent >= 50) color = "#4caf50";
    else if (percent >= 20) color = "#ff9800";
    else color = "#f44336";

    ring.style.stroke = color;
    remainingText.style.fill = color;

    percentText.textContent = `${Math.round(percent)}%`;

    // Remaining time
    const remainingMinutes = Math.max(Math.round((expectedCheckout - now) / 60000), 0);
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    remainingText.textContent = `${hours}h ${minutes}m`;
}

async function refreshPopup() {
    const spinner = document.getElementById("spinner");
    spinner.style.display = "block";

    try {
        const res = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "getSummary" }, r => {
                if (chrome.runtime.lastError) {
                    console.error("[Popup] Chrome runtime error:", chrome.runtime.lastError.message);
                    return reject(chrome.runtime.lastError);
                }
                if (!r) {
                    console.warn("[Popup] No response from background script");
                    return reject(new Error("No response from background"));
                }
                resolve(r);
            });
        });

        updateStatus("✅ Data synced from HRMS");
        updateSummary(res.summary);
        updateProgress(res.summary);

    } catch (err) {
        console.error("[Popup] Error fetching summary:", err);
        updateStatus("❌ Unable to fetch HRMS data. Please reopen popup.");
    } finally {
        spinner.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const spinner = document.getElementById("spinner");
    const ringContainer = document.getElementById("progress-ring-container");

    // --- Show spinner for at least 500ms ---
    spinner.style.display = "flex";
    ringContainer.style.display = "none";
    await new Promise(r => setTimeout(r, 500));

    // Fetch HRMS user
    chrome.runtime.sendMessage({ action: "getHRMSUser" }, (response) => {
        if (response?.hrmsUser) {
            const user = response.hrmsUser;
            const header = document.querySelector("h3");
            if (header) {
                header.innerText = `WorkPulse Tracker - ${user.firstname} (${user.employee_id})`;
            }
        }
    });

    // Initial status
    updateStatus("⌛ Fetching your status from HRMS...");

    try {
        const res = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "getSummary" }, r => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                if (!r) return reject(new Error("No response from background"));
                resolve(r);
            });
        });

        updateStatus("✅ Data synced from HRMS");
        updateSummary(res.summary);
        updateProgress(res.summary);

        // Show ring
        spinner.style.display = "none";
        ringContainer.style.display = "flex";

    } catch (err) {
        console.error("[Popup] Error fetching summary:", err);
        updateStatus("❌ Unable to fetch HRMS data. Please reopen popup.");
        spinner.style.display = "none";
    }

    // Auto-refresh every 2 minutes
    refreshPopup();
    setInterval(refreshPopup, 120000);
});