class Timer {
    constructor() {
        this.workMins = 25;
        this.breakMins = 5;
        this.longBreakMins = 15;
        this.mode = "work"; // "work" | "break" | "longBreak"
        this.timeLimit = this.workMins * 60 * 1000;
        this.timeLeft = this.timeLimit;
        this.startTime = null;
        this.elapsed = 0;
        this.paused = true;
        this.timerId = null;
        this.pomodoroIteration = 0;
    }

    getTimeLimitMs() {
        if (this.mode === "break") return this.breakMins * 60 * 1000;
        if (this.mode === "longBreak") return this.longBreakMins * 60 * 1000;
        return this.workMins * 60 * 1000;
    }

    advanceMode() {
        if (this.mode === "work") {
            this.mode = "break";
        } else if (this.mode === "break") {
            this.mode = (this.pomodoroIteration > 0 && this.pomodoroIteration % 4 === 0) ? "longBreak" : "work";
        } else {
            this.mode = "work";
        }
    }

    findNextMode() {
        if (this.mode === "work") {
            return "a break ☕️";
        } else if (this.mode === "break") {
            return (this.pomodoroIteration > 0 && this.pomodoroIteration % 4 === 0) ? "a well deserved long break ☕️" : "work 📝";
        } else {
            return "work 📝";
        }
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
                lastSavedAt: Date.now(),
                pomodoroIteration: this.pomodoroIteration,
                mode: this.mode
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
                if (this.mode === "work") this.pomodoroIteration++;
                this.pause();
                chrome.action.setBadgeText({text: ""})
                this.sendNotification(this.findNextMode())
                this.playSound()
                return;
            }

            this.saveState();
            this.timerId = setTimeout(tick, 1000);
        }

        tick();
    }

    sendNotification(nextIteration) {
        chrome.notifications.create(Date.now().toString(), {
            type: "basic",
            iconUrl: chrome.runtime.getURL("images/icons/pet-48.png"),
            title: "Timer finished!",
            message: `Time’s up! Next up is ${nextIteration}.`,
            priority: 2
        })
    }

    async playSound() {
      if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["AUDIO_PLAYBACK"],
          justification: "Play notification sound"
        });
      }

      chrome.runtime.sendMessage("finishedTimerSound");
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
        this.timeLimit = this.getTimeLimitMs();
        this.timeLeft = this.timeLimit;
        this.elapsed = 0;
        this.startTime = null;
        this.saveState();
        chrome.action.setBadgeText({text: ""})
    }
}

const timer = new Timer();

chrome.storage.local.get(["pomodoroTimer", "workMins", "breakMins", "longBreakMins"], (result) => {
    if (result.workMins) timer.workMins = result.workMins;
    if (result.breakMins) timer.breakMins = result.breakMins;
    if (result.longBreakMins) timer.longBreakMins = result.longBreakMins;

    const saved = result.pomodoroTimer;
    if (saved) {
        timer.timeLeft = saved.timeLeft;
        timer.paused = saved.paused;
        if (saved.mode) timer.mode = saved.mode;
        timer.pomodoroIteration = saved.pomodoroIteration || 0;
        // If timer was running when service worker was killed, account for elapsed sleep time
        if (!saved.paused && saved.lastSavedAt) {
            timer.timeLeft = Math.max(0, saved.timeLeft - (Date.now() - saved.lastSavedAt));
        }
        if (!timer.paused && timer.timerId === null) {
            timer.paused = true;
            timer.start();
        }
    } else {
        timer.timeLimit = timer.getTimeLimitMs();
        timer.timeLeft = timer.timeLimit;
        timer.saveState();
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
        if (changes.workMins) timer.workMins = changes.workMins.newValue;
        if (changes.breakMins) timer.breakMins = changes.breakMins.newValue;
        if (changes.longBreakMins) timer.longBreakMins = changes.longBreakMins.newValue;
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.greeting === "start") {
        timer.start();
    } else if (message.greeting === "pause") {
        timer.pause();
    } else if (message.greeting === "reset") {
        if (message.workMins) timer.workMins = message.workMins;
        if (message.breakMins) timer.breakMins = message.breakMins;
        if (message.longBreakMins) timer.longBreakMins = message.longBreakMins;
        timer.reset();
    } else if (message.greeting === "next") {
        chrome.storage.local.get(["workMins", "breakMins", "longBreakMins"], (result) => {
            if (result.workMins) timer.workMins = result.workMins;
            if (result.breakMins) timer.breakMins = result.breakMins;
            if (result.longBreakMins) timer.longBreakMins = result.longBreakMins;
            timer.advanceMode();
            timer.reset();
            timer.start();
        });
    }
});