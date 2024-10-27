// Typing effect for "I'm a [text]"
const texts = ["student", "web developer", "15 y/o", "designer", "pro robloxxer"];
let textIndex = 0;
let charIndex = 0;
const typingText = document.querySelector(".typing-text");
const typingIndicator = document.querySelector(".typing-indicator");

function type() {
    if (charIndex < texts[textIndex].length) {
        typingText.textContent += texts[textIndex][charIndex];
        charIndex++;
        setTimeout(type, 100); // Speed of typing
    } else {
        setTimeout(erase, 1000); // Pause before erasing
    }
}

function erase() {
    if (charIndex > 0) {
        typingText.textContent = texts[textIndex].substring(0, charIndex - 1);
        charIndex--;
        setTimeout(erase, 100); // Speed of erasing
    } else {
        textIndex = (textIndex + 1) % texts.length; // Cycle through text
        setTimeout(type, 500); // Pause before typing next text
    }
}

// Handle navbar hover effects
document.addEventListener("DOMContentLoaded", () => {
    type(); // Start typing effect

    // Navbar hover effect
    const navbarContainer = document.querySelector('.navbar-container');
    let navbarVisible = false;

    // Show navbar when cursor is near left edge
    document.addEventListener('mousemove', (e) => {
        if (e.clientX < 70) { // Adjusted activation distance
            navbarContainer.style.opacity = '1';
            navbarVisible = true;
        } else if (navbarVisible) {
            navbarContainer.style.opacity = '0';
            navbarVisible = false;
        }
    });

    // Scaling effect for navbar items based on cursor position
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('mouseover', () => {
            navItems.forEach(nav => {
                nav.style.transform = 'scale(0.9)'; // Shrink other items
            });
            item.style.transform = 'scale(1.2)'; // Enlarge hovered item
        });
        item.addEventListener('mouseout', () => {
            navItems.forEach(nav => {
                nav.style.transform = 'scale(1)'; // Reset size
            });
        });
    });
});
