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
        if (e.clientX < 140) { // Double the activation area for smoother display
            navbarContainer.style.opacity = '1';
            navbarVisible = true;
        } else if (navbarVisible) {
            navbarContainer.style.opacity = '0';
            navbarVisible = false;
        }
    });

    // Scaling effect for navbar items based on cursor position
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item, index) => {
        item.addEventListener('mousemove', (e) => {
            const distance = Math.abs(e.clientY - item.getBoundingClientRect().top);
            const scale = Math.max(1.1 - distance / 200, 1); // Dynamic scaling based on cursor proximity
            item.style.transform = `scale(${scale})`;
        });
        item.addEventListener('mouseout', () => {
            item.style.transform = 'scale(1)'; // Reset size on mouse out
        });
    });

    // Navbar auto-follow effect when cursor is in activation range but not directly over navbar
    document.addEventListener('mousemove', (e) => {
        if (e.clientX < 140 && !navbarContainer.contains(e.target)) {
            let closestItem = navItems[0];
            let minDistance = Math.abs(e.clientY - closestItem.getBoundingClientRect().top);

            navItems.forEach(item => {
                const distance = Math.abs(e.clientY - item.getBoundingClientRect().top);
                if (distance < minDistance) {
                    closestItem = item;
                    minDistance = distance;
                }
            });

            // Move the navbar 10% closer to cursor vertically
            const navbarTop = navbarContainer.getBoundingClientRect().top;
            const moveAmount = (e.clientY - navbarTop) * 0.1;
            navbarContainer.style.transform = `translateY(${moveAmount}px)`;
        }
    });
});
