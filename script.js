// Typing effect for "I'm a [text]"
const texts = ["student", "web developer", "gamer", "designer"];
let textIndex = 0;
let charIndex = 0;
const typingText = document.querySelector(".typing-text");
const typingIndicator = document.querySelector(".typing-indicator");

function type() {
    if (charIndex < texts[textIndex].length) {
        typingText.textContent += texts[textIndex][charIndex];
        charIndex++;
        setTimeout(type, 100);
    } else {
        setTimeout(erase, 1000);
    }
}

function erase() {
    if (charIndex > 0) {
        typingText.textContent = texts[textIndex].substring(0, charIndex - 1);
        charIndex--;
        setTimeout(erase, 100);
    } else {
        textIndex = (textIndex + 1) % texts.length;
        setTimeout(type, 1000);
    }
}

type();

// Randomize heart emoji
const hearts = ["❤️", "💙", "💜", "💖", "💚"];
document.getElementById("heart").textContent = hearts[Math.floor(Math.random() * hearts.length)];
