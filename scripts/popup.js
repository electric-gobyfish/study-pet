document.addEventListener("DOMContentLoaded", () => {
    // Progress bars update
    const bars = [
        { fillId: "healthFill", numId: "healthNum", current: 0, max: 100 },
        { fillId: "hungerFill", numId: "hungerNum", current: 0, max: 100 },
        { fillId: "xpFill", numId: "xpNum", current: 0, max: 100 },
    ];

    function updateBar(bar, amount) {
        bar.current = Math.min(bar.current + amount, bar.max);
        const percent = (bar.current / bar.max) * 100;

        const fillElem = document.getElementById(bar.fillId);
        const numElem = document.getElementById(bar.numId);

        if (fillElem) fillElem.style.width = percent + "%";
        if (numElem) numElem.textContent = `${bar.current} / ${bar.max}`;

        if (bar.current === bar.max && fillElem) {
            fillElem.classList.add("level-up");
            setTimeout(() => fillElem.classList.remove("level-up"), 300);
        }
    }

    updateBar(bars[0], 70);  // XP
    updateBar(bars[1], 50);  // Health
    updateBar(bars[2], 30);  // Hunger

    // Tabs show and hide
    const tabs = document.querySelectorAll(".tab");
    const tabContents = document.querySelectorAll(".tab-content");
    const tabTexts = document.querySelectorAll(".tab-text");

    if (tabs.length) tabs[0].classList.add("active");
    if (tabContents.length) tabContents[0].classList.add("active");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            tab.classList.add("active");

            const contentId = tab.id.replace("-button", "") + "-tab";
            const activeContent = document.getElementById(contentId);
            if (activeContent) activeContent.classList.add("active");
        });

        tab.addEventListener("mouseover", () => {
            tabTexts.forEach(t => t.classList.remove("hover"));
            tab.classList.add("hover");

            const textId = tab.id.replace("-button", "") + "-text";
            const activeText = document.getElementById(textId);
            if (activeText) activeText.classList.add("hover");
        });

        tab.addEventListener("mouseout", () => {
            tab.classList.remove("hover");

            const textId = tab.id.replace("-button", "") + "-text";
            const activeText = document.getElementById(textId);
            if (activeText) activeText.classList.remove("hover");
        });
    });

    // Pause, play and reset
    const pausePlayButtons = document.getElementsByClassName("pause-play-stack")[0];
    const resetButton = document.getElementById("reset-button");
    const timeNum = document.querySelector(".tomato-text");

    async function getPromiseTimer() {
        let result = await chrome.storage.local.get(["pomodoroTimer"]);
        return result.pomodoroTimer;
    }

    async function updateTime() {
        const timerValues = await getPromiseTimer();
        if (!timerValues) return;

        const totalSecs = Math.ceil(timerValues.timeLeft / 1000);
        let minsLeft = Math.floor(totalSecs / 60).toString().padStart(2, "0");
        let secsLeft = (totalSecs % 60).toString().padStart(2, "0");

        timeNum.textContent = `${minsLeft}:${secsLeft}`;

        if (timerValues.paused) {
            pausePlayButtons.classList.remove("paused");
        } else {
            pausePlayButtons.classList.add("paused");
        }
    }

    updateTime();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.pomodoroTimer) {
            updateTime()
        }
    })

    pausePlayButtons.addEventListener("click", async () => {
        const result = await chrome.storage.local.get(["pomodoroTimer"]);
        const timer = result.pomodoroTimer;

        if (!timer) return;

        if (timer.paused) {
            chrome.runtime.sendMessage({greeting: "start"});
        } else {
            chrome.runtime.sendMessage({greeting: "pause"});
        }
    });

    resetButton.addEventListener("click", () => {
        pausePlayButtons.classList.remove("paused");
        chrome.runtime.sendMessage({greeting: "reset"});
    });
});