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
        if (!typingText.classList.contains('deleting')) {
            typingText.classList.add('deleting');
        }
        typingText.textContent = texts[textIndex].substring(0, charIndex - 1);
        charIndex--;
        setTimeout(erase, 50);
    } else {
        typingText.classList.remove('deleting');
        textIndex = (textIndex + 1) % texts.length;
        setTimeout(type, 500);
    }
}

// Updated navbar interactions
document.addEventListener("DOMContentLoaded", () => {
    type();

    const navbarContainer = document.querySelector('.navbar-container');
    const navItems = document.querySelectorAll('.nav-item');
    let navbarVisible = false;

    document.addEventListener('mousemove', (e) => {
        // Show/hide navbar
        if (e.clientX < 180) {
            navbarContainer.style.opacity = '1';
            navbarVisible = true;

            // Reduced movement amount
            const moveAmount = (e.clientY - window.innerHeight / 2) * 0.05;
            navbarContainer.style.transform = `translateY(calc(-50% + ${moveAmount}px))`;

            // Dynamic scaling based on cursor position
            navItems.forEach(item => {
                const rect = item.getBoundingClientRect();
                const distance = Math.abs(e.clientY - (rect.top + rect.height / 2));
                const scale = Math.max(1.15 - distance / 100, 1);
                const opacity = Math.max(1 - distance / 150, 0.7);
                
                item.style.transform = `scale(${scale})`;
                item.style.opacity = opacity;
            });
        } else if (navbarVisible) {
            navbarContainer.style.opacity = '0';
            navbarVisible = false;
            
            // Reset all items
            navItems.forEach(item => {
                item.style.transform = 'scale(1)';
                item.style.opacity = '1';
            });
        }
    });
});
