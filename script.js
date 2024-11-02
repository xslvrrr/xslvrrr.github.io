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
        if (e.clientX < 220) {
            navbarContainer.style.opacity = '1';
            navbarVisible = true;

            // Reduced movement amount
            const moveAmount = (e.clientY - window.innerHeight / 2) * 0.05;
            navbarContainer.style.transform = `translateY(calc(-50% + ${moveAmount}px))`;

            // Get the total height of the navbar
            const firstItem = navItems[0].getBoundingClientRect();
            const lastItem = navItems[navItems.length - 1].getBoundingClientRect();
            const navHeight = lastItem.bottom - firstItem.top;
            const navCenter = firstItem.top + navHeight / 2;

            // Scale all items based on cursor distance
            navItems.forEach(item => {
                const rect = item.getBoundingClientRect();
                const itemCenterY = rect.top + (rect.height / 2);
                
                // Calculate distance from cursor as a percentage of nav height
                const distanceFromCursor = Math.abs(e.clientY - itemCenterY);
                const distancePercent = distanceFromCursor / (navHeight / 2);
                
                // Adjust these values to control the scaling effect
                const maxScale = 1.2;  // Maximum scale when cursor is closest
                const minScale = 0.9;  // Minimum scale when cursor is furthest
                const scaleRange = maxScale - minScale;
                
                // Calculate scale with a smoother falloff
                const scale = maxScale - (Math.min(distancePercent, 1) * scaleRange);
                
                // Apply transform with smooth transition
                item.style.transform = `scale(${scale})`;
                item.style.transition = 'transform 0.15s ease-out';
            });
        } else if (navbarVisible) {
            navbarContainer.style.opacity = '0';
            navbarVisible = false;
            
            // Reset all items
            navItems.forEach(item => {
                item.style.transform = 'scale(1)';
            });
        }
    });
});
