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
            html += `<div class="label checkin">${line}</div>`;
        } else if (line.startsWith("Expected Checkout:")) {
            html += `<div class="label checkout">${line}</div>`;
        } else if (line.startsWith("Breaks:")) {
            html += `<div class="label breaks">${line}</div>`;
        } else if (/^\s*\d+\./.test(line)) {
            html += `<div class="break-item">${line}</div>`;
        } else {
            html += `<div class="summary-text">${line}</div>`;
        }
    });

    summaryDiv.innerHTML = html;
}

function updateProgress(summary) {
    const progressBar = document.getElementById("progress-bar");
    const progressContainer = document.getElementById("progress-container");

    let workStart = null, workEnd = null, breaks = [];

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

    summary.split("\n").forEach(line => {
        if (line.startsWith("Check In:")) {
            const t = line.replace("Check In:", "").trim();
            if (t) workStart = new Date(`${todayStr}T${t}`);
        }
        if (line.startsWith("Check Out:")) {
            const t = line.replace("Check Out:", "").trim();
            if (t) workEnd = new Date(`${todayStr}T${t}`);
        }
        if (line.includes("-") && line.includes("min")) {
            const parts = line.split("-");
            const start = new Date(`${todayStr}T${parts[0].replace(/\d+\.\s*/, "").trim()}`);
            const end = new Date(`${todayStr}T${parts[1].split("(")[0].trim()}`);
            const duration = (end - start);
            breaks.push({ start, end, duration });
        }
    });

    if (!workStart) {
        progressBar.style.width = "0%";
        progressBar.style.backgroundColor = "#ff4d4d";
        progressContainer.setAttribute("data-remaining", "Work not started");
        return;
    }

    const WORK_MINUTES = 510; // 8.5 hours
    const totalBreakMinutes = breaks.reduce((sum, b) => sum + (b.duration || 0), 0) / 60000;

    // Calculate expected checkout by adding work + breaks
    const expectedCheckout = new Date(workStart.getTime() + (WORK_MINUTES + totalBreakMinutes) * 60000);

    const now = workEnd || new Date();
    let completedMinutes = ((now - workStart) / 60000);
    if (completedMinutes < 0) completedMinutes = 0;

    let percent = Math.min((completedMinutes / (WORK_MINUTES + totalBreakMinutes)) * 100, 100);
    progressBar.style.width = percent + "%";

    // Color gradient
    if (percent < 50) {
        const r = 180;
        const g = Math.floor(70 + (85 * (percent / 50)));
        const b = 50;
        progressBar.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    } else {
        const r = Math.floor(200 - 200 * ((percent - 50) / 50));
        const g = 150;
        const b = 60;
        progressBar.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    }

    const remainingMinutes = Math.max(Math.round((expectedCheckout - now) / 60000), 0);
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = Math.floor(remainingMinutes % 60);
    progressContainer.setAttribute("data-remaining", `Remaining: ${hours}h ${minutes}m`);

    // Update Expected Checkout label in summary
    const summaryDiv = document.getElementById("summary");
    const expectedLabel = summaryDiv.querySelector(".checkout");
    if (expectedLabel) {
        expectedLabel.innerText = `Expected Checkout: ${expectedCheckout.toLocaleTimeString()}`;
    }
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
    // Fetch HRMS user for the header
    chrome.runtime.sendMessage({ action: "getHRMSUser" }, (response) => {
        if (response?.hrmsUser) {
            const user = response.hrmsUser;
            const header = document.querySelector("h3");
            if (header) {
                header.innerText = `WorkPulse Tracker - ${user.firstname} (${user.employee_id})`;
            }
        }
    });

    // Start auto-refresh every 2 minutes
    refreshPopup();
    setInterval(refreshPopup, 120000);

    // Initial spinner/status
    updateStatus("⌛ Fetching your status from HRMS...");
    const spinner = document.getElementById("spinner");
    spinner.style.display = "block";

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

    } catch (err) {
        console.error("[Popup] Error fetching summary:", err);
        updateStatus("❌ Unable to fetch HRMS data. Please reopen popup.");
    } finally {
        spinner.style.display = "none";
    }
});

