// Typing animation
const texts = ["student", "web developer", "15 y/o", "designer", "pro robloxxer"];
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
        setTimeout(erase, 2000);
    }
}

function erase() {
    if (charIndex > 0) {
        typingText.textContent = texts[textIndex].substring(0, charIndex - 1);
        charIndex--;
        setTimeout(erase, 50);
    } else {
        textIndex = (textIndex + 1) % texts.length;
        setTimeout(type, 500);
    }
}

// Navbar interactions
document.addEventListener("DOMContentLoaded", () => {
    type();

    const navbarContainer = document.querySelector('.navbar-container');
    const navItems = document.querySelectorAll('.nav-item');
    let navbarVisible = false;

    document.addEventListener('mousemove', (e) => {
        // Show/hide navbar
        if (e.clientX < 140) {
            navbarContainer.style.opacity = '1';
            navbarVisible = true;
        } else if (navbarVisible) {
            navbarContainer.style.opacity = '0';
            navbarVisible = false;
        }

        // Navbar vertical follow
        if (e.clientX < 140) {
            const moveAmount = (e.clientY - window.innerHeight / 2) * 0.1;
            navbarContainer.style.transform = `translateY(calc(-50% + ${moveAmount}px))`;
        }
    });

    // Dynamic text scaling
    navItems.forEach(item => {
        item.addEventListener('mousemove', (e) => {
            const rect = item.getBoundingClientRect();
            const distance = Math.abs(e.clientY - (rect.top + rect.height / 2));
            const scale = Math.max(1.1 - distance / 200, 1);
            item.style.transform = `scale(${scale})`;
        });

        item.addEventListener('mouseleave', () => {
            item.style.transform = 'scale(1)';
        });
    });
});
