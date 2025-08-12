function updateTime() {
  const now = new Date();
  document.getElementById('time').textContent = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  document.getElementById('date').textContent = now.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'});
}
setInterval(updateTime, 1000);
updateTime();

const quotes = [
  "Simplicity is the ultimate sophistication.",
  "Do one thing well.",
  "Small steps every day.",
  "Focus on what matters.",
  "Elegance is refusal.",
  "Time is what we want most, but use worst."
];
document.getElementById('quote').textContent = quotes[Math.floor(Math.random() * quotes.length)];

async function fetchWeather() {
  try {
    const lat = -33.8688; // Sydney
    const lon = 151.2093;
    const apiKey = "https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&current_weather=true";
    const res = await fetch(apiKey);
    const data = await res.json();
    const weather = data.current_weather;
    document.getElementById('weather').textContent = `${weather.temperature}°C • ${weather.weathercode <= 2 ? 'Clear' : 'Cloudy'}`;
  } catch {
    document.getElementById('weather').textContent = "Weather unavailable";
  }
}
fetchWeather();
