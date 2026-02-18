class Timer {
    constructor(timeLimitSecs = 100) {
        this.timeLimit = timeLimitSecs * 1000;
        this.timeLeft = this.timeLimit;
        this.startTime = null;
        this.elapsed = 0;
        this.paused = true;
        this.timerId = null;
    }

    updateBadgeTime() {
        const totalSecs = Math.ceil(this.timeLeft / 1000);
        let minsLeft = Math.floor(totalSecs / 60).toString().padStart(2, "0");
        let secsLeft = (totalSecs % 60).toString().padStart(2, "0");
        chrome.action.setBadgeText({text: `${minsLeft}:${secsLeft}`})
    }

    saveState() {
        chrome.storage.local.set({
            pomodoroTimer: {
                timeLeft: this.timeLeft,
                paused: this.paused,
                startTime: this.startTime,
                lastSavedAt: Date.now()
            }
        });
        if (this.startTime !== null) {
            this.updateBadgeTime()
        } else {
            chrome.action.setBadgeText({text: ""})
        }
    }

    start() {
        if (!this.paused) return;
        this.paused = false;
        this.updateBadgeTime();

        this.startTime = Date.now();
        const remainingAtStart = this.timeLeft;
        this.saveState();

        const tick = () => {
            this.elapsed = Date.now() - this.startTime;
            this.timeLeft = remainingAtStart - this.elapsed;

            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.pause();
                return;
            }

            this.saveState();
            this.timerId = setTimeout(tick, 1000);
        }

        this.timerId = setTimeout(tick, 1000);
    }

    pause() {
        if (!this.paused && this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
            this.paused = true;
            this.saveState();
        }
    }

    reset() {
        this.pause();
        this.timeLeft = this.timeLimit;
        this.elapsed = 0;
        this.startTime = null;
        this.saveState();
        chrome.action.setBadgeText({text: ""})
    }
}

const timer = new Timer();

chrome.storage.local.get(["pomodoroTimer"], (result) => {
    const saved = result.pomodoroTimer;
    if (saved) {
        timer.timeLeft = saved.timeLeft;
        timer.paused = saved.paused;
        // If timer was running when service worker was killed, account for elapsed sleep time
        if (!saved.paused && saved.lastSavedAt) {
            timer.timeLeft = Math.max(0, saved.timeLeft - (Date.now() - saved.lastSavedAt));
        }
        if (!timer.paused) {
            timer.start();
        }
    } else {
        timer.saveState();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.greeting === "start") {
        timer.start();
    } else if (message.greeting === "pause") {
        timer.pause();
    } else if (message.greeting === "reset") {
        timer.reset();
    }
})