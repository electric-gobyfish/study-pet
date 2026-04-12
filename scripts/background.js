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
        this.hasStarted = false;
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
                mode: this.mode,
                hasStarted: this.hasStarted
            }
        });
        if (this.hasStarted && this.timeLeft > 0) {
            this.updateBadgeTime();
        } else {
            chrome.action.setBadgeText({text: ""});
        }
    }

    start() {
        if (!this.paused) return;
        this.paused = false;
        this.hasStarted = true;
        this.updateBadgeTime();

        this.startTime = Date.now();
        const remainingAtStart = this.timeLeft;
        chrome.alarms.create('timerExpiry', { when: Date.now() + remainingAtStart });
        this.saveState();

        const tick = () => {
            this.elapsed = Date.now() - this.startTime;
            this.timeLeft = remainingAtStart - this.elapsed;

            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                if (this.mode === "work") this.pomodoroIteration++;
                clearTimeout(this.timerId);
                this.timerId = null;
                this.paused = true;
                this.saveState();
                setTimeout(() => chrome.action.setBadgeText({text: ""}), 1000);
                chrome.alarms.clear('timerExpiry');
                this.sendNotification(this.findNextMode());
                this.playSound();
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
            chrome.alarms.clear('timerExpiry');
        }
    }

    reset() {
        this.pause();
        this.hasStarted = false;
        this.timeLimit = this.getTimeLimitMs();
        this.timeLeft = this.timeLimit;
        this.elapsed = 0;
        this.startTime = null;
        this.saveState();
        chrome.action.setBadgeText({text: ""})
    }
}

const timer = new Timer();

// Wrap initialization in a promise so message handlers never act on a blank timer
// (race condition: SW wakes up, messages arrive before storage.get callback fires).
const initPromise = new Promise(resolve => {
    chrome.storage.local.get(["pomodoroTimer", "workMins", "breakMins", "longBreakMins", "timerPausedByWindowClose"], (result) => {
        if (result.workMins) timer.workMins = result.workMins;
        if (result.breakMins) timer.breakMins = result.breakMins;
        if (result.longBreakMins) timer.longBreakMins = result.longBreakMins;

        const saved = result.pomodoroTimer;
        if (saved) {
            timer.timeLeft = saved.timeLeft;
            timer.paused = saved.paused;
            if (saved.mode) timer.mode = saved.mode;
            timer.pomodoroIteration = saved.pomodoroIteration || 0;
            timer.hasStarted = saved.hasStarted || false;
            // If timer was running when service worker was killed, account for elapsed sleep time
            if (!saved.paused && saved.lastSavedAt) {
                timer.timeLeft = Math.max(0, saved.timeLeft - (Date.now() - saved.lastSavedAt));
            }
            if (!timer.paused && timer.timerId === null) {
                timer.paused = true;
                timer.start();
            } else if (timer.paused && timer.hasStarted && result.timerPausedByWindowClose) {
                // Timer was paused because all windows closed; resume if a window is now open
                chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
                    if (windows.length > 0) {
                        chrome.storage.local.remove('timerPausedByWindowClose');
                        timer.start();
                    }
                });
            } else if (timer.paused && timer.hasStarted) {
                timer.updateBadgeTime();
            }
        } else {
            timer.timeLimit = timer.getTimeLimitMs();
            timer.timeLeft = timer.timeLimit;
            timer.saveState();
        }
        resolve();
    });
});

// Alarm listener wakes the SW when the timer expires while the service worker is dead.
// The init code (via start() -> tick()) handles the actual expiry; this is a safety net.
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'timerExpiry') return;
    initPromise.then(() => {
        if (timer.paused) return;
        if (timer.mode === 'work') timer.pomodoroIteration++;
        clearTimeout(timer.timerId);
        timer.timerId = null;
        timer.paused = true;
        timer.timeLeft = 0;
        timer.saveState();
        setTimeout(() => chrome.action.setBadgeText({text: ""}), 1000);
        chrome.alarms.clear('timerExpiry');
        timer.sendNotification(timer.findNextMode());
        timer.playSound();
    });
});

chrome.windows.onRemoved.addListener(() => {
    chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
        if (windows.length === 0 && !timer.paused) {
            timer.pause();
            chrome.storage.local.set({ timerPausedByWindowClose: true });
        }
    });
});

chrome.windows.onCreated.addListener((win) => {
    if (win.type !== 'normal') return;
    chrome.storage.local.get(['timerPausedByWindowClose'], (result) => {
        if (result.timerPausedByWindowClose) {
            chrome.storage.local.remove('timerPausedByWindowClose');
            initPromise.then(() => timer.start());
        }
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
        if (changes.workMins) timer.workMins = changes.workMins.newValue;
        if (changes.breakMins) timer.breakMins = changes.breakMins.newValue;
        if (changes.longBreakMins) timer.longBreakMins = changes.longBreakMins.newValue;
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    initPromise.then(() => {
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
    return true;
});