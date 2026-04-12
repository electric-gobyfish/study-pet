chrome.runtime.onMessage.addListener((msg) => {
    if (msg === "finishedTimerSound") {
        const finishedSound = document.getElementById("finished-sound");
        finishedSound.currentTime = 0;
        finishedSound.play();
    } else if (msg === "buttonTimerSound") {
        const buttonSound = document.getElementById("button-sound");
        buttonSound.currentTime = 0;
        buttonSound.play();
    };
});