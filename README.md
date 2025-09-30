# Millennium Portal Redesign

A modern, fast, and intuitive redesign of the Millennium student portal built with Next.js.

## 🚀 Features

- ⚡ **Blazing Fast** - Optimized with code splitting, caching, and native fetch
- 🎨 **Modern UI** - Clean, professional design with smooth animations
- 🔒 **Secure** - HTTPOnly cookies, encrypted sessions, XSS protection
- ♿ **Accessible** - WCAG compliant with keyboard shortcuts
- 📱 **Responsive** - Works seamlessly on all devices
- 🎯 **PWA Ready** - Installable as a progressive web app

## 📦 Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your SESSION_SECRET

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🔧 Environment Variables

Create a `.env.local` file:

```env
SESSION_SECRET=your-secret-key-minimum-32-characters
NODE_ENV=production
```

**Important**: Generate a secure random string for `SESSION_SECRET`. You can use:
```bash
openssl rand -base64 32
```

## 🚢 Deployment to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variable: `SESSION_SECRET` (minimum 32 characters)
4. Deploy!

### Vercel Environment Variables

Set these in your Vercel project settings:
- `SESSION_SECRET`: Your secure session secret (32+ characters)

## ⌨️ Keyboard Shortcuts

- `Cmd/Ctrl + K` - Open search
- `Cmd/Ctrl + H` - Go to home
- `Cmd/Ctrl + N` - Open notifications
- `Cmd/Ctrl + R` - Refresh data

## 🏗️ Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: CSS Modules
- **State Management**: React Hooks
- **Session**: Iron Session
- **Web Scraping**: Cheerio

## 📂 Project Structure

```
├── pages/              # Next.js pages
│   ├── api/           # API routes
│   ├── _app.tsx       # App wrapper
│   ├── _document.tsx  # HTML document
│   ├── index.tsx      # Home page
│   ├── login.tsx      # Login page
│   └── dashboard.tsx  # Main dashboard
├── components/        # Reusable components
├── hooks/            # Custom React hooks
├── lib/              # Utility functions
├── styles/           # CSS modules
├── types/            # TypeScript types
└── public/           # Static assets
```

## 🎯 Performance

- **Bundle Size**: 82.7 KB (First Load JS)
- **Home Page**: 1.15 KB
- **Login Page**: 2.69 KB  
- **Dashboard**: 10.5 KB
- **Lighthouse Score**: 95+ (Production)
- **Core Web Vitals**: Optimized for LCP, FID, CLS

## 🔒 Security Features

- HTTPOnly session cookies
- Encrypted session data (AES-256-GCM)
- XSS protection with DOMPurify
- CSRF protection
- Secure headers (X-Frame-Options, CSP, etc.)
- No sensitive data in client
- Removed X-Powered-By header
- robots.txt for crawler control

## 🎨 Customization

### Themes

Edit `/styles/globals.css` to customize colors:

```css
:root {
  --main-bg: #050505;
  --text-primary: #F7F8F8;
  --border-color: rgba(255, 255, 255, 0.08);
  /* ... more variables */
}
```

## 🐛 Troubleshooting

### Build Errors

1. **"Cannot find module 'critters'"**
   - Removed `experimental.optimizeCss` from next.config.js

2. **Session errors**
   - Ensure `SESSION_SECRET` is set and is at least 32 characters

3. **TypeScript errors**
   - Run `npm install` to ensure all types are installed

### Development Issues

- Clear `.next` folder: `rm -rf .next`
- Clear node_modules: `rm -rf node_modules && npm install`

## 📝 License

This project is for educational purposes.

## 🙏 Acknowledgments

- Original Millennium Portal by Compaid Solutions
- Design inspiration from Linear and Notion

## 📧 Support

For issues or questions, please open an issue on GitHub.

---

Built with ❤️ for students
