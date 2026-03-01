chrome.runtime.onMessage.addListener((msg) => {
    if (msg === "finishedTimerSound") {
        const finishedSound = document.getElementById("finished-sound");
        finishedSound.currentTime = 0;
        finishedSound.play();
    }
});