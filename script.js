// Typing effect for "I'm a [text]"
const texts = ["student", "web developer", "15 y/o", "designer"];
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
        textIndex = (textIndex + 1) % texts.length;
        setTimeout(type, 500); // Pause before typing next text
    }
}

// Navbar hover and scaling effects
document.addEventListener("DOMContentLoaded", () => {
    type(); // Start typing effect

    const navbarContainer = document.querySelector('.navbar-container');
    const navItems = document.querySelectorAll('.nav-item');
    const activationThreshold = 100; // Expanded activation width for hover area
    let navbarVisible = false;

    // Dynamic scaling based on cursor position
    document.addEventListener('mousemove', (e) => {
        // Navbar activation within the specified threshold
        if (e.clientX < activationThreshold) {
            navbarContainer.style.opacity = '1';
            navbarVisible = true;
            moveNavbarCloser(e); // Smoothly move navbar closer to cursor when in range
        } else if (navbarVisible) {
            navbarContainer.style.opacity = '0';
            navbarVisible = false;
        }

        // Dynamic text scaling in navbar
        navItems.forEach((item, index) => {
            const rect = item.getBoundingClientRect();
            const distance = Math.abs(e.clientY - rect.top - rect.height / 2);
            const scaleFactor = Math.max(1, 1.5 - distance / 150); // Scale dynamically based on distance
            item.style.transform = `translateX(${index * 5}px) scale(${scaleFactor})`;
        });
    });

    function moveNavbarCloser(e) {
        navItems.forEach((item, index) => {
            const rect = item.getBoundingClientRect();
            const distance = Math.abs(e.clientX - rect.left);
            const moveCloser = distance * 0.1; // Move 10% of the distance toward cursor
            item.style.left = `${parseFloat(item.style.left || 0) + moveCloser}px`;
        });
    }

    // Social buttons links
    document.querySelector(".discord-btn").onclick = () => window.open("https://discord.com/users/717659256069029949", "_blank");
    document.querySelector(".github-btn").onclick = () => window.open("https://github.com/xslvrrr", "_blank");
    document.querySelector(".youtube-btn").onclick = () => window.open("https://www.youtube.com/@xslvrr", "_blank");
});
