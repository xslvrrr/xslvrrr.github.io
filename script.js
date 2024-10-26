const typingElement = document.querySelector('.typing-text');
const phrases = ['student', 'web developer', 'music addict', 'pro robloxian'];
let phraseIndex = 0;
let letterIndex = 0;

function type() {
    if (letterIndex < phrases[phraseIndex].length) {
        typingElement.innerHTML += phrases[phraseIndex].charAt(letterIndex);
        letterIndex++;
        setTimeout(type, 150);
    } else {
        setTimeout(deleteText, 1000);
    }
}

function deleteText() {
    if (letterIndex > 0) {
        typingElement.innerHTML = phrases[phraseIndex].substring(0, letterIndex - 1);
        letterIndex--;
        setTimeout(deleteText, 100);
    } else {
        phraseIndex = (phraseIndex + 1) % phrases.length;
        setTimeout(type, 500);
    }
}

// Load boxes with animation
document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '1'; // Show the card
            card.style.animation = 'fadeInUp 0.5s forwards'; // Apply fade-in animation
        }, index * 200); // Stagger the animation
    });
});

// Start the typing effect
type();
