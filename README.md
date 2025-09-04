# Millennium Redesign

A modern redesign of the Millennium Education portal built with Next.js, providing a clean and user-friendly interface for the existing school portal.

## Features

- **Server-side Authentication**: Secure login handling via Next.js API routes
- **Session Management**: Persistent user sessions with iron-session
- **Responsive Design**: Modern UI that works on all devices
- **Debug Mode**: Test the interface without real credentials
- **CORS-free**: No cross-origin issues thanks to server-side proxy

## Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment variables:
Create a `.env.local` file in the root directory:
```
SESSION_SECRET=your-secret-key-minimum-32-characters-long
NODE_ENV=development
```

**Important**: For production deployment, generate a secure random SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Deployment

**Quick Deploy to Vercel:**

1. Push to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/millennium-redesign.git
git push -u origin main
```

2. Deploy on Vercel:
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Add environment variable: `SESSION_SECRET` (generate with the command above)
   - Click Deploy

Your site will be live at `https://millennium-redesign.vercel.app`

**See `DEPLOYMENT_GUIDE.txt` for detailed instructions.**

## Usage

### Debug Mode

For testing purposes, you can use the debug login:
- Username: `debug`
- Password: `debug123`
- School: `Test School`

Or use the "Debug Access" / "Try demo" buttons for instant access.

### Real Login

The system authenticates with the actual Millennium Education portal:
1. Enter your real Millennium credentials
2. The server securely validates them with millennium.education
3. On success, you'll be redirected to the redesigned dashboard

## Project Structure

```
├── pages/
│   ├── api/auth/          # Authentication API routes
│   ├── _app.tsx          # Main app component
│   ├── index.tsx         # Home page
│   ├── login.tsx         # Login page
│   └── dashboard.tsx     # Protected dashboard
├── styles/               # CSS modules
├── lib/
│   └── session.ts        # Session management
├── public/Assets/        # Static assets
└── README.md
```

## Technology Stack

- **Framework**: Next.js 14
- **Authentication**: Custom server-side implementation
- **Session Management**: iron-session
- **Styling**: CSS Modules
- **Deployment**: Vercel

## Security

- All authentication happens server-side
- Sessions are encrypted with iron-session
- CORS issues resolved through Next.js API routes
- No credentials stored in browser localStorage for real logins

## Development Notes

This project was designed to wrap the existing Millennium Education portal with a modern interface. The authentication system:

1. Accepts user credentials on the redesigned login page
2. Submits them server-side to millennium.education
3. Tracks the response to determine success/failure
4. Creates encrypted sessions for successful logins
5. Provides the redesigned interface while maintaining security

The debug mode allows testing the interface without needing real Millennium credentials.
