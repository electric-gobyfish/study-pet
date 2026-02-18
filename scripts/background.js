class Timer {
    constructor(timeLimitSecs = 1500) {
        this.timeLimit = timeLimitSecs * 1000;
        this.timeLeft = this.timeLimit;
        this.startTime = null;
        this.elapsed = 0;
        this.paused = true;
        this.timerId = null;
    }

    saveState() {
        chrome.storage.local.set({
            pomodoroTimer: {
                timeLeft: this.timeLeft,
                paused: this.paused,
                startTime: this.startTime
            }
        });
    }

    start() {
        if (!this.paused && this.timerId !== null) return;
        this.paused = false;

        this.startTime = Date.now();

        const tick = () => {
            this.elapsed = Date.now() - this.startTime;
            this.timeLeft = this.timeLimit - this.elapsed;
            this.saveState();

            if (this.timeLeft <= 0 ) {
                this.pause();
                saveState();
                return;
            }

            this.timerId = setTimeout(tick, 1000);
            this.saveState();
        }

        tick();
    }

    pause() {
        if (this.paused && this.timerId === null) {
            clearTimeout(this.timerId);
            this.timerId = null;
            this.paused = true;
            this.saveState();
        }
    }

    reset() {
        if (!this.paused && this.timerId !== null) {
            this.pause();
            this.timeLeft = this.timeLimit;
            this.elapsed = 0;
            this.saveState();
        }
    }
}

const timer = new Timer();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.greeting === "start") {
        timer.start();
    } else if (message.greeting === "pause") {
        timer.pause();
    } else if (message.greeting === "reset") {
        timer.reset();
    }
})